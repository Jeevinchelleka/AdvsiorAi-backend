/**
 * RAG Pipeline — AdvisorAI Intelligent Agent
 *
 * Pipeline:
 *  1. Load conversation history from DB
 *  2. Classify intent
 *  3. Detect query type (list-all vs specific entity vs summary)
 *  4. Fetch context directly from Prisma (fast, reliable)
 *  5. Inject aggregated stats for summary intents
 *  6. Generate with Gemini
 *  7. Return response + save to DB
 */

const axios = require("axios");
const prisma = require("../../prisma/prisma");
const { classifyIntent, getTablesForIntent, INTENTS } = require("./intent.service");
const { retrieveContext, fetchAggregatedStats } = require("./retriever.service");
const { semanticSearch, formatVectorContext } = require("./vector.service");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function getGeminiUrl() {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

// ─── System Prompts ───────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are AdvisorAI — an intelligent financial advisor concierge for a broker-dealer firm.

You have LIVE access to the firm's real database. The DATABASE CONTEXT section contains REAL data fetched specifically for this query. Use it as your ONLY source of truth.

RULES:
- ALWAYS use the exact data from DATABASE CONTEXT — never say "I don't have that data" if data is provided
- When asked to list clients, portfolios, holdings, etc. — list ALL of them from the context
- Use exact numbers, names, and values from the data
- Format currency as $1,234.56 and percentages as 12.3%
- Use bullet points or tables for lists
- Be concise but thorough`;

const INTENT_PROMPTS = {
  [INTENTS.ADVISOR_PRODUCTIVITY]: `${BASE_SYSTEM}

FOCUS: Advisor Productivity — summarize performance, flag risks, prep meeting briefs.
List all portfolios with AUM, flag underperformers, give 3 actionable recommendations.`,

  [INTENTS.CLIENT_INTELLIGENCE]: `${BASE_SYSTEM}

FOCUS: Client Intelligence — segment by risk/AUM/goals, surface next-best-actions, detect life events.
List all clients with their risk profiles, net worth, and investment goals. Identify cross-sell opportunities.`,

  [INTENTS.PORTFOLIO_INSIGHTS]: `${BASE_SYSTEM}

FOCUS: Portfolio Analytics — exact performance, P&L per holding, concentration risks, rebalancing.
Report total value, risk score, and performance for every portfolio. Flag holdings >25% allocation.`,

  [INTENTS.CONVERSATIONAL_SEARCH]: `${BASE_SYSTEM}

FOCUS: Data Lookup — answer precisely from the retrieved data.
If asked to list all of something, list EVERY item found in the DATABASE CONTEXT.
Include exact prices, quantities, dates, names, and statuses.`,

  [INTENTS.COMPLIANCE]: `${BASE_SYSTEM}

FOCUS: Compliance & Supervision — list ALL alerts with severity and client names.
Flag concentration risks (>25% in a single holding). Provide audit-ready explanations.`,

  [INTENTS.REVENUE_ENABLEMENT]: `${BASE_SYSTEM}

FOCUS: Revenue Enablement — identify clients with high net worth but low portfolio utilization.
List all recommendations per client. Prioritize opportunities by AUM potential.`,

  [INTENTS.GENERAL]: `${BASE_SYSTEM}

Answer using the DATABASE CONTEXT where relevant. For general financial questions, provide accurate professional guidance.`,
};

const SUGGESTIONS = {
  [INTENTS.ADVISOR_PRODUCTIVITY]:  ["What are my top 3 risks today?", "Summarize all client portfolios", "Which portfolios are underperforming?"],
  [INTENTS.CLIENT_INTELLIGENCE]:   ["Which clients have retirement goals?", "Show high-risk client profiles", "Who has the highest net worth?"],
  [INTENTS.PORTFOLIO_INSIGHTS]:    ["Which holdings have the best P&L?", "Show all concentration risks", "What is the total AUM?"],
  [INTENTS.CONVERSATIONAL_SEARCH]: ["List all clients", "Show all compliance alerts", "What is the price of AAPL?"],
  [INTENTS.COMPLIANCE]:            ["Show all critical compliance alerts", "Which holdings breach 25% limit?", "List open violations"],
  [INTENTS.REVENUE_ENABLEMENT]:    ["Show cross-sell recommendations", "Which clients are underinvested?", "List all AI recommendations"],
  [INTENTS.GENERAL]:               ["Summarize my book of business", "What are the top risks?", "Show portfolio performance"],
};

// ─── Detect query type ────────────────────────────────────────────────────────

// Returns the search string to pass to retriever — empty string = fetch all records
function getSearchQuery(message) {
  const msg = message.toLowerCase();

  // "list all X", "show all X", "give me all X", "what are all X", "display all X"
  const listAllPattern = /\b(list|show|give me|display|what are|find|get)\b.*\b(all|every|each)\b/i;
  // "all clients", "all users", "all portfolios", etc.
  const allEntityPattern = /\ball\s+(clients|users|portfolios|holdings|transactions|alerts|recommendations|reports|market data|stocks)\b/i;
  // Just asking for a category: "list clients", "show users"
  const simpleCategoryPattern = /^(list|show|give me|display|get)\s+(clients|users|portfolios|holdings|transactions|alerts|recommendations)\s*$/i;

  if (listAllPattern.test(msg) || allEntityPattern.test(msg) || simpleCategoryPattern.test(msg)) {
    return ""; // empty = fetch all
  }

  return message; // specific query
}

// Detect which specific entity tables are explicitly mentioned
function getExplicitTables(message) {
  const msg = message.toLowerCase();
  const extra = [];
  if (/\buser[s]?\b/.test(msg) && !/portfolio|client|holding/.test(msg)) extra.push("users");
  return extra;
}

// ─── Load Conversation History ────────────────────────────────────────────────

async function loadConversationHistory(conversationId) {
  if (!conversationId) return [];
  try {
    const conv = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return conv?.messages?.map(m => ({ role: m.sender === "user" ? "user" : "assistant", content: m.message || "" })) || [];
  } catch (e) {
    console.warn("[rag] loadConversationHistory failed:", e.message);
    return [];
  }
}

// ─── Gemini Call ──────────────────────────────────────────────────────────────

async function callGemini(systemPrompt, contextText, message, history = []) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");

  const contents = [];
  for (const msg of history) {
    if (!msg.content?.trim()) continue;
    contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] });
  }

  const userText = contextText
    ? `DATABASE CONTEXT (use this as ground truth — list ALL items shown):\n${contextText}\n\n---\nQUESTION: ${message}`
    : message;

  contents.push({ role: "user", parts: [{ text: userText }] });

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096, topP: 0.8 },
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

  // Step 1: Load conversation history
  let fullHistory = history;
  if (conversationId && history.length === 0) {
    fullHistory = await loadConversationHistory(conversationId);
  }

  // Step 2: Classify intent
  const { intent, confidence } = classifyIntent(message);

  // Step 3: Get tables + detect query type
  let tables = getTablesForIntent(intent);
  const extraTables = getExplicitTables(message);
  for (const t of extraTables) {
    if (!tables.includes(t)) tables = [t, ...tables];
  }
  const searchQuery = getSearchQuery(message);

  // Step 4: Hybrid relational lookup — client/portfolio name matching
  let relationalContext = "";
  try {
    const words = message.split(/[^a-zA-Z]/).map(w => w.trim()).filter(w => w.length >= 3);

    if (words.length > 0 && searchQuery !== "") {
      const [matchedClients, matchedPortfolios] = await Promise.all([
        prisma.client.findMany({
          where: {
            OR: words.flatMap(word => [
              { firstName: { contains: word, mode: "insensitive" } },
              { lastName:  { contains: word, mode: "insensitive" } },
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
            interactions: { take: 3, orderBy: { interactionDate: "desc" } },
            notes: { take: 3 },
          },
        }),
        prisma.portfolio.findMany({
          where: { OR: words.flatMap(word => [{ portfolioName: { contains: word, mode: "insensitive" } }]) },
          include: { client: true, holdings: true },
        }),
      ]);

      for (const c of matchedClients) {
        relationalContext += `=== CLIENT PROFILE: ${c.firstName} ${c.lastName} ===\n`;
        relationalContext += `Demographics: Age=${c.age ?? "N/A"}, Occupation=${c.occupation ?? "N/A"}, City=${c.city ?? "N/A"}\n`;
        relationalContext += `Financials: Income=$${c.annualIncome ?? "N/A"}, Net Worth=$${c.netWorth ?? "N/A"}, Goal=${c.investmentGoal ?? "N/A"}, Risk=${c.riskProfile ?? "N/A"}, Score=${c.riskScore ?? "N/A"}/10, KYC=${c.kycStatus}\n`;

        for (const p of c.portfolios || []) {
          relationalContext += `Portfolio "${p.portfolioName}": $${p.totalValue}, Risk ${p.riskScore}/10, Perf ${p.performanceScore}%\n`;
          for (const h of p.holdings || []) {
            const pnl = h.purchasePrice > 0 ? (((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100).toFixed(1) : "N/A";
            relationalContext += `  Holding: ${h.symbol} (${h.assetType}) Qty:${h.quantity} Buy:$${h.purchasePrice} Now:$${h.currentPrice} P&L:${pnl}% Alloc:${h.allocationPercentage}%\n`;
          }
        }
        for (const a of c.complianceAlerts || []) {
          relationalContext += `Alert [${a.severity}]: ${a.alertMessage} | Status: ${a.status}\n`;
        }
        for (const r of c.recommendations || []) {
          relationalContext += `Recommendation [${r.recommendationType}]: ${r.recommendationText} (${r.confidenceScore ? (r.confidenceScore*100).toFixed(0)+"%" : "N/A"} confidence)\n`;
        }
        relationalContext += "\n";
      }

      for (const p of matchedPortfolios) {
        if (matchedClients.some(c => c.id === p.clientId)) continue;
        relationalContext += `=== PORTFOLIO: "${p.portfolioName}" ===\n`;
        if (p.client) relationalContext += `Owner: ${p.client.firstName} ${p.client.lastName} (${p.client.riskProfile})\n`;
        relationalContext += `Value: $${p.totalValue}, Risk: ${p.riskScore}/10, Perf: ${p.performanceScore}%\n`;
        for (const h of p.holdings || []) {
          const pnl = h.purchasePrice > 0 ? (((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100).toFixed(1) : "N/A";
          relationalContext += `  ${h.symbol}: Qty=${h.quantity}, Buy=$${h.purchasePrice}, Now=$${h.currentPrice}, P&L=${pnl}%, Alloc=${h.allocationPercentage}%\n`;
        }
        relationalContext += "\n";
      }
    }
  } catch (err) {
    console.warn("[rag] Relational lookup failed:", err.message);
  }

  // Step 5: Parallel — Prisma retrieval + pgvector semantic search (Knowledge Layer)
  const [prismaContext, vectorResults] = await Promise.all([
    retrieveContext(tables, searchQuery).catch(e => { console.warn("[rag] retrieveContext:", e.message); return null; }),
    searchQuery ? semanticSearch(message, tables, 6).catch(() => []) : Promise.resolve([]),
  ]);
  const vectorContext = formatVectorContext(vectorResults);

  // Step 6: Aggregated stats for summary intents
  let statsText = "";
  const needsStats = [INTENTS.ADVISOR_PRODUCTIVITY, INTENTS.PORTFOLIO_INSIGHTS, INTENTS.COMPLIANCE, INTENTS.GENERAL].includes(intent);
  if (needsStats) {
    const stats = await fetchAggregatedStats().catch(() => null);
    if (stats) {
      statsText =
        `=== LIVE BOOK SUMMARY ===\n` +
        `Total Clients: ${stats.totalClients} | Total Portfolios: ${stats.totalPortfolios} | Total Transactions: ${stats.totalTransactions}\n` +
        `Total AUM: $${stats.totalAUM} | Avg Risk Score: ${stats.avgRiskScore}/10 | Avg Performance: ${stats.avgPerformanceScore}%\n` +
        `Open Compliance Alerts: ${stats.openComplianceAlerts}\n` +
        `Concentration Risks (>20%): ${stats.concentrationRisks.length > 0 ? stats.concentrationRisks.join(", ") : "None"}`;
    }
  }

  // Step 7: Build final context (relational → prisma → vector → stats)
  const contextParts = [statsText, relationalContext, prismaContext, vectorContext].filter(Boolean);
  const contextText = contextParts.length > 0 ? contextParts.join("\n\n") : null;

  // Step 8: Generate with Gemini
  const systemPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS[INTENTS.GENERAL];
  const responseText = await callGemini(systemPrompt, contextText, message, fullHistory);

  // Step 9: Save to DB (async, non-blocking)
  if (conversationId) {
    setImmediate(async () => {
      try {
        await prisma.aiMessage.createMany({
          data: [
            { conversationId, sender: "user",      message: message },
            { conversationId, sender: "assistant", message: responseText },
          ],
        });
      } catch (e) {
        console.warn("[rag] Failed to save messages:", e.message);
      }
    });
  }

  return {
    response: responseText,
    metadata: { intent, confidence, tablesQueried: tables, searchQuery: searchQuery || "(all records)", suggestions: SUGGESTIONS[intent] || SUGGESTIONS[INTENTS.GENERAL] },
  };
}

module.exports = { ragChat, loadConversationHistory };
