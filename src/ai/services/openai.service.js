const OpenAI = require("openai");
const axios = require("axios");
const supabaseClient = require("../../lib/supabase");

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const AI_PROVIDER = process.env.AI_PROVIDER?.toLowerCase() || "openai";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-mini";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_TOKENS = 500;

const SEARCH_CONFIG = {
  clients:           ["first_name", "last_name", "email", "phone", "investment_goal", "risk_profile"],
  portfolios:        ["portfolio_name"],
  holdings:          ["symbol", "asset_type"],
  transactions:      ["symbol", "transaction_type", "status"],
  compliance_alerts: ["alert_message", "severity", "status"],
  recommendations:   ["recommendation_type", "recommendation_text"],
  market_data:       ["symbol"],
  research_reports:  ["title", "category", "content"],
};

function sanitizeQuery(query) {
  return String(query || "")
    .replace(/%/g, "\\%")
    .trim();
}

function buildSearchFilter(columns, query) {
  if (!query) return null;
  const escaped = sanitizeQuery(query);
  return columns.map((column) => `${column}.ilike.%${escaped}%`).join(",");
}

function formatRecord(table, row) {
  if (!row) return "";

  switch (table) {
    case "clients":
      return `Client ${row.first_name || ""} ${row.last_name || ""} (email: ${row.email || "N/A"}, phone: ${row.phone || "N/A"}) has risk profile ${row.risk_profile || "N/A"}, annual income ${row.annual_income ?? "N/A"}, net worth ${row.net_worth ?? "N/A"}, goal: ${row.investment_goal || "N/A"}.`;
    case "portfolios":
      return `Portfolio ${row.portfolio_name || "Unnamed"} for client ${row.client_id || "N/A"}: total value ${row.total_value ?? "N/A"}, risk score ${row.risk_score ?? "N/A"}, performance score ${row.performance_score ?? "N/A"}.`;
    case "holdings":
      return `Holding ${row.symbol || "N/A"} (${row.asset_type || "N/A"}) in portfolio ${row.portfolio_id || "N/A"}: quantity ${row.quantity ?? "N/A"}, purchase price ${row.purchase_price ?? "N/A"}, current price ${row.current_price ?? "N/A"}, allocation ${row.allocation_percentage ?? "N/A"}%.`;
    case "transactions":
      return `Transaction ${row.transaction_type || "N/A"} ${row.symbol || "N/A"} in portfolio ${row.portfolio_id || "N/A"} on ${row.trade_date ? new Date(row.trade_date).toISOString().split("T")[0] : "N/A"}: quantity ${row.quantity ?? "N/A"}, price ${row.price ?? "N/A"}, status ${row.status || "N/A"}.`;
    case "compliance_alerts":
      return `Compliance alert (${row.severity || "N/A"} severity, status: ${row.status || "N/A"}): ${row.alert_message || "N/A"}. Client ID: ${row.client_id || "N/A"}.`;
    case "recommendations":
      return `Recommendation (${row.recommendation_type || "N/A"}, confidence: ${row.confidence_score ?? "N/A"}): ${row.recommendation_text || "N/A"}. Reasoning: ${row.reasoning || "N/A"}. Client ID: ${row.client_id || "N/A"}.`;
    case "market_data":
      return `Market data for ${row.symbol || "N/A"}: price $${row.current_price ?? "N/A"}, daily change ${row.daily_change ?? "N/A"}%, volume ${row.volume ?? "N/A"}.`;
    case "research_reports":
      return `Research report "${row.title || "Untitled"}" (${row.category || "N/A"}): ${(row.content || "").slice(0, 200)}.`;
    default:
      return JSON.stringify(row);
  }
}

async function fetchTableRecords(table, query) {
  if (!supabaseClient) return [];

  const searchColumns = SEARCH_CONFIG[table] || [];
  const hasQuery = Boolean(query?.trim());
  let records = [];

  if (hasQuery && searchColumns.length > 0) {
    const filter = buildSearchFilter(searchColumns, query);
    const { data, error } = await supabaseClient
      .from(table)
      .select("*")
      .or(filter)
      .limit(5);

    if (error) {
      console.warn(
        `Supabase search failed for ${table}:`,
        error.message || error,
      );
    } else if (Array.isArray(data) && data.length > 0) {
      records = data;
    }
  }

  if (records.length === 0) {
    const builder = supabaseClient.from(table).select("*").limit(5);
    if (table === "clients" || table === "portfolios") {
      builder.order("created_at", { ascending: false });
    }
    const { data, error } = await builder;
    if (error) {
      console.warn(
        `Supabase fetch failed for ${table}:`,
        error.message || error,
      );
      return [];
    }
    records = Array.isArray(data) ? data : [];
  }

  return records;
}

async function buildRetrievalContext(query) {
  if (!supabaseClient) {
    return "Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY to enable database retrieval.";
  }

  const tableNames = Object.keys(SEARCH_CONFIG);
  const contextParts = [];

  for (const table of tableNames) {
    const records = await fetchTableRecords(table, query);
    if (!records || records.length === 0) continue;

    const section = records
      .map((record) => formatRecord(table, record))
      .filter(Boolean)
      .join("\n");

    if (section) {
      contextParts.push(`---\nTable: ${table}\n${section}`);
    }
  }

  if (contextParts.length === 0) {
    return "No relevant database records were found for this query.";
  }

  return contextParts.join("\n\n");
}

function buildConversationMessages(message, history, contextText) {
  const messages = [
    {
      role: "system",
      content:
        "You are AdvisorAI, a financial advisor assistant. Use the supplied database facts to answer portfolio, client, holdings, and transaction questions accurately. If a user asks for information not present in the database, say you do not have that information rather than fabricating it.",
    },
  ];

  if (contextText) {
    messages.push({
      role: "system",
      content: `Database facts:\n${contextText}`,
    });
  }

  if (Array.isArray(history) && history.length > 0) {
    messages.push(
      ...history.map((item) => ({ role: item.role, content: item.content })),
    );
  }

  messages.push({ role: "user", content: message });
  return messages;
}

async function generateOpenAIResponse(message, history, contextText) {
  if (!openaiClient) {
    throw new Error(
      "OPENAI_API_KEY is not configured in the backend environment.",
    );
  }

  const messages = buildConversationMessages(message, history, contextText);
  const completion = await openaiClient.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    max_tokens: MAX_TOKENS,
  });

  return (
    completion.choices?.[0]?.message?.content?.trim() ||
    "I could not generate a reply."
  );
}

async function generateGeminiResponse(message, history, contextText) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured in the backend environment.",
    );
  }

  const historyText = Array.isArray(history)
    ? history
        .map(
          (item) =>
            `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`,
        )
        .join("\n")
    : "";

  const prompt = `You are AdvisorAI, a financial advisor assistant. Use the supplied database facts to answer portfolio, client, holdings, and transaction questions accurately. If a user asks for information not present in the database, say you do not have that information rather than fabricating it.\n\nDatabase facts:\n${contextText}\n\nConversation:\n${historyText}\nUser: ${message}\nAssistant:`;

  const url = `https://gemini.googleapis.com/v1/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generate`;

  try {
    const response = await axios.post(
      url,
      {
        prompt: { text: prompt },
        temperature: 0.2,
        max_output_tokens: MAX_TOKENS,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
      },
    );

    const candidate = response?.data?.candidates?.[0];
    return (
      candidate?.content?.text?.trim() ||
      candidate?.content?.trim() ||
      response?.data?.output?.[0]?.content?.text?.trim() ||
      "I could not generate a reply."
    );
  } catch (error) {
    console.error(
      "Gemini request failed:",
      error?.response?.data || error.message || error,
    );
    throw new Error(
      "Gemini request failed. Check your API key, provider, and network connectivity.",
    );
  }
}

async function createChatResponse(message, history = []) {
  if (!message || typeof message !== "string") {
    throw new Error("A valid message is required.");
  }

  const contextText = await buildRetrievalContext(message);

  if (AI_PROVIDER === "gemini") {
    return generateGeminiResponse(message, history, contextText);
  }

  return generateOpenAIResponse(message, history, contextText);
}

module.exports = {
  createChatResponse,
};
