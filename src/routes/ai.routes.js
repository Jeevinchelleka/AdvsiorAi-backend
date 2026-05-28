const express = require("express");
const router  = express.Router();
const {
  chatWithAI, getConversationHistory,
  getBookSummary, getClientInsights,
  getRiskAnalysis, getComplianceCheck,
  getRevenueOpportunities, getPortfolioInsights,
  detectIntent,
} = require("../ai/controllers/chat.controller");
const { streamChat }  = require("../ai/controllers/stream.controller");
const { indexTable }  = require("../ai/services/vector.service");

router.post("/chat",                        chatWithAI);
router.post("/chat/stream",                 streamChat);

// Admin: trigger pgvector indexing for a table (Knowledge Layer setup)
router.post("/index-vectors", async (req, res) => {
  const tables = req.body.tables || ["clients","portfolios","holdings","compliance_alerts","recommendations","market_data","research_reports"];
  const results = {};
  for (const table of tables) {
    results[table] = await indexTable(table).catch(e => ({ error: e.message }));
  }
  res.json({ message: "Indexing complete", results });
});
router.get("/history/:conversationId",      getConversationHistory);
router.get("/book-summary",                 getBookSummary);
router.get("/client-insights/:clientId",    getClientInsights);
router.get("/risk-analysis",                getRiskAnalysis);
router.get("/compliance-check",             getComplianceCheck);
router.get("/revenue-opportunities",        getRevenueOpportunities);
router.get("/portfolio-insights",           getPortfolioInsights);
router.get("/intent",                       detectIntent);

module.exports = router;
