/**
 * RAG Pipeline — AdvisorAI Intelligent Agent
 *
 * Pipeline:
 *  1. Load conversation history from DB (persistent memory)
 *  2. Classify intent
 *  3. Semantic retrieval via Gemini embeddings (vector search)
 *  4. Aggregate stats for summary queries
 *  5. Build rich context
 *  6. Generate with Gemini (correct v1beta endpoint)
 *  7. Return enriched response + save to DB
 */

const axios = require("axios");
const prisma = require("../../prisma/prisma");
const { classifyIntent, getTablesForIntent, INTENTS } = require("./intent.service");
const { semanticRetrieve, formatDocsAsContext } = require("./vector.service");
const { fetchAggregatedStats } = require("./retriever.service");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function getGeminiUrl() {
  // Read at call time so env is always loaded
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

// ─── System Prompts ───────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are AdvisorAI — an intelligent financial advisor concierge for a broker-dealer firm.

You have LIVE access to the firm's database. The DATABASE CONTEXT section in each message contains REAL data retrieved specifically for this query. Use it as your primary source of truth.

RULES:
- Use EXACT numbers from the database context — never estimate or fabricate
- When listing clients, portfolios, or holdings, name them specifically from the data
- If the data doesn't contain what was asked, say "I don't have that data" — don't guess
- Format numbers as currency ($1,234.56) or percentages (12.3%) as appropriate
- Use bullet points or sections for complex answers
- Be concise but complete — advisors are busy`;

const INTENT_PROMPTS = {
  [INTENTS.ADVISOR_PRODUCTIVITY]: `${BASE_SYSTEM}

FOCUS: Advisor Productivity
- Summarize portfolio performance with exact AUM figures from the data
- Identify top risks (concentration, compliance, underperformance)
- Prepare client meeting briefs with 360-degree views
- Give 3 specific, actionable recommendations the advisor can act on today`,

  [INTENTS.CLIENT_INTELLIGENCE]: `${BASE_SYSTEM}

FOCUS: Client Intelligence
- Segment clients by risk profile, AUM, and investment goals using the actual client data
- Surface next-best-action recommendations from the recommendations table
- Detect life-event signals (retirement goals, liquidity needs) from client profiles
- Identify cross-sell/upsell opportunities based on net worth vs portfolio value gaps`,

  [INTENTS.PORTFOLIO_INSIGHTS]: `${BASE_SYSTEM}

FOCUS: Portfolio Analytics
- Report exact performance scores and AUM from the portfolios table
- Analyze P&L per holding (current_price vs purchase_price)
- Flag concentration risks (holdings >25% allocation)
- Give specific rebalancing recommendations with target allocations`,

  [INTENTS.CONVERSATIONAL_SEARCH]: `${BASE_SYSTEM}

FOCUS: Data Search
- Answer precisely from the retrieved data
- For lists, show all items found in the data
- Include exact prices, quantities, dates, and statuses
- If asked about a specific symbol or client, find it in the context`,

  [INTENTS.COMPLIANCE]: `${BASE_SYSTEM}

FOCUS: Compliance & Supervision
- List ALL compliance alerts from the data with severity and status
- Flag holdings exceeding 25% concentration limit
- Provide audit-ready explanations for each violation
- Recommend escalation for Critical severity items
- Include client names for each alert`,

  [INTENTS.REVENUE_ENABLEMENT]: `${BASE_SYSTEM}

FOCUS: Revenue Enablement
- Identify clients with high net worth but low portfolio utilization
- Map recommendations to specific clients from the data
- Prioritize opportunities by potential AUM impact
- Suggest specific products based on client risk profiles`,

  [INTENTS.GENERAL]: `${BASE_SYSTEM}

Answer using the database context where relevant. For general financial questions not in the data, provide accurate professional guidance.`,
};

const SUGGESTIONS = {
  [INTENTS.ADVISOR_PRODUCTIVITY]:  ["What are my top 3 risks today?", "Summarize all client portfolios", "Which portfolios are underperforming?"],
  [INTENTS.CLIENT_INTELLIGENCE]:   ["Which clients have retirement goals?", "Show high-risk client profiles", "Who has the highest net worth?"],
  [INTENTS.PORTFOLIO_INSIGHTS]:    ["Which holdings have the best P&L?", "Show all concentration risks", "What is the total AUM?"],
  [INTENTS.CONVERSATIONAL_SEARCH]: ["Show all BUY transactions", "List all research reports", "What is the price of AAPL?"],
  [INTENTS.COMPLIANCE]:            ["Show all critical compliance alerts", "Which holdings breach 25% limit?", "List open violations"],
  [INTENTS.REVENUE_ENABLEMENT]:    ["Show cross-sell recommendations", "Which clients are underinvested?", "List all AI recommendations"],
  [INTENTS.GENERAL]:               ["Summarize my book of business", "What are the top risks?", "Show portfolio performance"],
};

// ─── Load Conversation History from DB ───────────────────────────────────────

async function loadConversationHistory(conversationId) {
  if (!conversationId) return [];
  try {
    const conv = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conv?.messages) return [];
    return conv.messages.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.message || "",
    }));
  } catch (e) {
    console.warn("[rag] Failed to load conversation history:", e.message);
    return [];
  }
}

// ─── Gemini Call ──────────────────────────────────────────────────────────────

async function callGemini(systemPrompt, contextText, message, history = []) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");

  const contents = [];

  // Add conversation history (Gemini: "user"/"model" roles)
  for (const msg of history) {
    if (!msg.content?.trim()) continue;
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  // Current message with injected context
  const hasContext = contextText && !contextText.startsWith("No relevant data");
  const userText = hasContext
    ? `DATABASE CONTEXT (use this as ground truth):\n${contextText}\n\n---\nQUESTION: ${message}`
    : message;

  contents.push({ role: "user", parts: [{ text: userText }] });

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.2,       // Low temp = factual, grounded answers
      maxOutputTokens: 2048,
      topP: 0.8,
    },
  };

  const response = await axios.post(getGeminiUrl(), body, {
    headers: { "Content-Type": "application/json" },
    timeout: 60000,
  });

  const candidate = response.data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    if (candidate?.finishReason === "SAFETY") return "I'm unable to respond due to safety guidelines.";
    throw new Error(`Gemini returned empty response. Finish reason: ${candidate?.finishReason}`);
  }

  return text.trim();
}

// ─── Main RAG Pipeline ────────────────────────────────────────────────────────

async function ragChat(message, history = [], conversationId = null) {
  if (!message?.trim()) throw new Error("Message is required.");

  // Step 1: Load full conversation history from DB if conversationId provided
  let fullHistory = history;
  if (conversationId && history.length === 0) {
    fullHistory = await loadConversationHistory(conversationId);
  }

  // Step 2: Classify intent
  const { intent, confidence } = classifyIntent(message);

  // Step 3: Determine tables
  const tables = getTablesForIntent(intent);

  // Step 3.5: Dynamic Client & Portfolio Context Extraction (Hybrid Relational Lookup)
  let relationalContext = "";
  try {
    // Parse words of 3+ letters, clean punctuation
    const words = message
      .split(/[^a-zA-Z]/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);

    if (words.length > 0) {
      // Find matching clients
      const matchedClients = await prisma.client.findMany({
        where: {
          OR: words.flatMap((word) => [
            { firstName: { contains: word, mode: "insensitive" } },
            { lastName: { contains: word, mode: "insensitive" } },
          ]),
        },
        include: {
          portfolios: {
            include: {
              holdings: true,
              transactions: { take: 5, orderBy: { tradeDate: "desc" } },
            },
          },
          complianceAlerts: true,
          recommendations: true,
          interactions: { take: 5, orderBy: { interactionDate: "desc" } },
          notes: true,
        },
      });

      for (const c of matchedClients) {
        relationalContext += `=== CLIENT PROFILE & LIVE ACCOUNT DETAILS: ${c.firstName} ${c.lastName} ===\n`;
        relationalContext += `Client ID: ${c.id}\n`;
        relationalContext += `Demographics: Age = ${c.age ?? "N/A"}, Occupation = ${c.occupation ?? "N/A"}, Location = ${c.city ?? "N/A"}, ${c.country ?? "US"}\n`;
        relationalContext += `Financials: Annual Income = $${c.annualIncome ?? "N/A"}, Net Worth = $${c.netWorth ?? "N/A"}, Goal = ${c.investmentGoal ?? "N/A"}, Risk Profile = ${c.riskProfile ?? "N/A"}, Suitability Score = ${c.riskScore ?? "N/A"}/10, KYC = ${c.kycStatus ?? "Verified"}\n`;

        if (c.portfolios && c.portfolios.length > 0) {
          relationalContext += `Portfolios & Assets:\n`;
          for (const p of c.portfolios) {
            relationalContext += `  * Portfolio: "${p.portfolioName}" (Value: $${p.totalValue ?? 0}, Risk Score: ${p.riskScore ?? 0}/10, Performance Score: ${p.performanceScore ?? 0}%, Benchmark: ${p.benchmark ?? "S&P 500"})\n`;
            if (p.holdings && p.holdings.length > 0) {
              relationalContext += `    Holdings:\n`;
              for (const h of p.holdings) {
                const pnl = h.purchasePrice > 0 ? (((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100).toFixed(1) : "N/A";
                relationalContext += `      - Holding: ${h.symbol} | Asset Class: ${h.assetType ?? "Equity"} | Qty: ${h.quantity ?? 0} | Purchase Price: $${h.purchasePrice ?? 0} | Current Price: $${h.currentPrice ?? 0} | P&L: ${pnl}% | Allocation: ${h.allocationPercentage ?? 0}%\n`;
              }
            }
          }
        }

        if (c.complianceAlerts && c.complianceAlerts.length > 0) {
          relationalContext += `Compliance Alerts:\n`;
          for (const alert of c.complianceAlerts) {
            relationalContext += `  * [${alert.severity}] Status: ${alert.status} | Message: ${alert.alertMessage} (Created: ${alert.createdAt ? new Date(alert.createdAt).toISOString().split("T")[0] : "N/A"})\n`;
          }
        }

        if (c.recommendations && c.recommendations.length > 0) {
          relationalContext += `AI Recommendations:\n`;
          for (const rec of c.recommendations) {
            relationalContext += `  * [${rec.recommendationType}] ${rec.recommendationText} (Reasoning: ${rec.reasoning ?? "N/A"}, Confidence: ${rec.confidenceScore ? (rec.confidenceScore * 100).toFixed(0) + "%" : "N/A"})\n`;
          }
        }

        if (c.interactions && c.interactions.length > 0) {
          relationalContext += `Interactions Log:\n`;
          for (const i of c.interactions) {
            relationalContext += `  * ${i.interactionDate ? new Date(i.interactionDate).toISOString().split("T")[0] : "N/A"} - [Type: ${i.interactionType}] | Subject: ${i.subject ?? "N/A"} | Notes: ${i.notes ?? ""} | Sentiment: ${i.sentiment ?? "Neutral"}\n`;
          }
        }
        relationalContext += `\n`;
      }

      // Also search portfolios directly if mentioned in query
      const matchedPortfolios = await prisma.portfolio.findMany({
        where: {
          OR: words.flatMap((word) => [
            { portfolioName: { contains: word, mode: "insensitive" } },
          ]),
        },
        include: {
          client: true,
          holdings: true,
        },
      });

      for (const p of matchedPortfolios) {
        const isClientAlreadyMatched = matchedClients.some((c) => c.id === p.clientId);
        if (!isClientAlreadyMatched) {
          relationalContext += `=== PORTFOLIO & LIVE ASSETS: "${p.portfolioName}" ===\n`;
          if (p.client) {
            relationalContext += `Client Owner: ${p.client.firstName} ${p.client.lastName} (Risk Profile: ${p.client.riskProfile}, Net Worth: $${p.client.netWorth})\n`;
          }
          relationalContext += `Metrics: Total Value = $${p.totalValue ?? 0}, Risk Score = ${p.riskScore ?? 0}/10, Performance = ${p.performanceScore ?? 0}%\n`;
          if (p.holdings && p.holdings.length > 0) {
            relationalContext += `Holdings:\n`;
            for (const h of p.holdings) {
              const pnl = h.purchasePrice > 0 ? (((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100).toFixed(1) : "N/A";
              relationalContext += `  - Holding: ${h.symbol} (${h.assetType ?? "Equity"}): Qty ${h.quantity ?? 0}, Purchase Price $${h.purchasePrice ?? 0}, Current Price $${h.currentPrice ?? 0}, P&L ${pnl}%, Alloc ${h.allocationPercentage ?? 0}%\n`;
            }
          }
          relationalContext += `\n`;
        }
      }
    }
  } catch (err) {
    console.warn("[rag] Relational lookup failed:", err.message);
  }

  // Step 4: Semantic retrieval (vector search via Gemini embeddings)
  let contextText = "No relevant data found.";
  try {
    const docs = await semanticRetrieve(message, tables, 15);
    contextText = formatDocsAsContext(docs);
  } catch (e) {
    console.warn("[rag] Semantic retrieval failed:", e.message);
  }

  // Prepend relational database search matches to vector results
  if (relationalContext) {
    contextText = relationalContext + "\n\n" + contextText;
  }

  // Step 5: For summary intents, also inject aggregated stats
  const needsStats = [INTENTS.ADVISOR_PRODUCTIVITY, INTENTS.PORTFOLIO_INSIGHTS, INTENTS.COMPLIANCE].includes(intent);
  if (needsStats) {
    try {
      const stats = await fetchAggregatedStats();
      if (stats) {
        const statsText =
          `=== LIVE BOOK SUMMARY ===\n` +
          `Total Clients: ${stats.totalClients}\n` +
          `Total Portfolios: ${stats.totalPortfolios}\n` +
          `Total Transactions: ${stats.totalTransactions}\n` +
          `Total AUM: $${stats.totalAUM}\n` +
          `Avg Risk Score: ${stats.avgRiskScore}/10\n` +
          `Avg Performance Score: ${stats.avgPerformanceScore}%\n` +
          `Open Compliance Alerts: ${stats.openComplianceAlerts}\n` +
          `Concentration Risks (>20%): ${stats.concentrationRisks.length > 0 ? stats.concentrationRisks.join(", ") : "None"}`;
        contextText = statsText + "\n\n" + contextText;
      }
    } catch (e) {
      console.warn("[rag] Stats fetch failed:", e.message);
    }
  }

  // Step 6: Generate with Gemini
  const systemPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS[INTENTS.GENERAL];
  const responseText = await callGemini(systemPrompt, contextText, message, fullHistory);

  return {
    response: responseText,
    metadata: {
      intent,
      confidence,
      tablesQueried: tables,
      suggestions: SUGGESTIONS[intent] || SUGGESTIONS[INTENTS.GENERAL],
    },
  };
}

module.exports = { ragChat, loadConversationHistory };
