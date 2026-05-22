const express = require("express");
const router = express.Router();
const {
  chatWithAI, getConversationHistory,
  getBookSummary, getClientInsights,
  getRiskAnalysis, getComplianceCheck,
  getRevenueOpportunities, getPortfolioInsights,
  detectIntent,
} = require("../ai/controllers/chat.controller");

router.post("/chat",                        chatWithAI);
router.get("/history/:conversationId",      getConversationHistory);
router.get("/book-summary",                 getBookSummary);
router.get("/client-insights/:clientId",    getClientInsights);
router.get("/risk-analysis",                getRiskAnalysis);
router.get("/compliance-check",             getComplianceCheck);
router.get("/revenue-opportunities",        getRevenueOpportunities);
router.get("/portfolio-insights",           getPortfolioInsights);
router.get("/intent",                       detectIntent);

module.exports = router;
