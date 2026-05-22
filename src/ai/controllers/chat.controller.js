const { ragChat, loadConversationHistory } = require("../services/rag.service");
const { classifyIntent, INTENTS } = require("../services/intent.service");
const { fetchAggregatedStats } = require("../services/retriever.service");
const prisma = require("../../prisma/prisma");

// ─── POST /ai/chat ────────────────────────────────────────────────────────────
async function chatWithAI(req, res) {
  const { message, history, conversationId } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "A valid message is required." });
  }

  try {
    // Pass conversationId so RAG can load full history from DB
    const result = await ragChat(message.trim(), history || [], conversationId || null);
    return res.json(result);
  } catch (error) {
    console.error("[chat] error:", error?.response?.data || error.message);
    const detail = error?.response?.data?.error?.message || error.message || "Unknown error";
    return res.status(500).json({ error: "Unable to process the AI request.", detail });
  }
}

// ─── GET /ai/history/:conversationId ─────────────────────────────────────────
async function getConversationHistory(req, res) {
  try {
    const history = await loadConversationHistory(req.params.conversationId);
    return res.json({ history });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load history." });
  }
}

// ─── GET /ai/book-summary ─────────────────────────────────────────────────────
async function getBookSummary(req, res) {
  try {
    const stats = await fetchAggregatedStats();
    const result = await ragChat("Give me a comprehensive summary of my entire book of business today. Include: total AUM, client count, top risks, compliance status, and 3 actionable recommendations.", [], null);
    return res.json({ ...result, stats });
  } catch (e) {
    console.error("[book-summary]", e.message);
    return res.status(500).json({ error: "Failed to generate book summary." });
  }
}

// ─── GET /ai/client-insights/:clientId ───────────────────────────────────────
async function getClientInsights(req, res) {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.clientId },
      include: {
        portfolios: { include: { holdings: true, transactions: { take: 5, orderBy: { tradeDate: "desc" } } } },
        recommendations: { take: 5, orderBy: { createdAt: "desc" } },
        complianceAlerts: { where: { status: { not: "resolved" } } },
      },
    });
    if (!client) return res.status(404).json({ error: "Client not found." });

    const result = await ragChat(
      `Provide a complete 360-degree intelligence report for client ${client.firstName} ${client.lastName} (risk profile: ${client.riskProfile}, goal: ${client.investmentGoal}, net worth: $${client.netWorth}). Include portfolio performance, holdings analysis, compliance status, and next-best-action recommendations.`,
      [], null
    );
    return res.json({ ...result, client });
  } catch (e) {
    console.error("[client-insights]", e.message);
    return res.status(500).json({ error: "Failed to generate client insights." });
  }
}

// ─── GET /ai/risk-analysis ────────────────────────────────────────────────────
async function getRiskAnalysis(req, res) {
  try {
    const result = await ragChat("Analyze all risks in my book: concentration risks by holding, compliance violations by severity, underperforming portfolios, and high-risk clients. Give me a prioritized risk register with specific names and numbers.", [], null);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: "Failed to generate risk analysis." });
  }
}

// ─── GET /ai/compliance-check ─────────────────────────────────────────────────
async function getComplianceCheck(req, res) {
  try {
    const result = await ragChat("Run a full compliance check. List every open compliance alert with client name, severity, and status. Flag any holdings exceeding 25% concentration. Provide audit-ready explanations.", [], null);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: "Failed to run compliance check." });
  }
}

// ─── GET /ai/revenue-opportunities ───────────────────────────────────────────
async function getRevenueOpportunities(req, res) {
  try {
    const result = await ragChat("Identify all revenue opportunities: clients with high net worth but low portfolio value, existing recommendations by type, and product suitability gaps. Prioritize by potential AUM impact with specific client names.", [], null);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: "Failed to identify revenue opportunities." });
  }
}

// ─── GET /ai/portfolio-insights ──────────────────────────────────────────────
async function getPortfolioInsights(req, res) {
  try {
    const result = await ragChat("Provide full portfolio analytics: list every portfolio with its value, risk score, and performance score. Show top holdings by P&L. Flag concentration risks. Give rebalancing recommendations.", [], null);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: "Failed to generate portfolio insights." });
  }
}

// ─── GET /ai/intent ───────────────────────────────────────────────────────────
async function detectIntent(req, res) {
  const { message } = req.query;
  if (!message) return res.status(400).json({ error: "message query param required." });
  return res.json(classifyIntent(message));
}

module.exports = {
  chatWithAI, getConversationHistory,
  getBookSummary, getClientInsights,
  getRiskAnalysis, getComplianceCheck,
  getRevenueOpportunities, getPortfolioInsights,
  detectIntent,
};
