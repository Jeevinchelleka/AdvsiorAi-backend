const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /clients — enriched with portfolio stats + new fields
router.get("/", async (req, res) => {
  try {
    const [clients, portfolios, alerts] = await Promise.all([
      prisma.client.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.portfolio.findMany({ select: { clientId: true, totalValue: true, riskScore: true, performanceScore: true } }),
      prisma.complianceAlert.findMany({ select: { clientId: true, status: true, severity: true } }),
    ]);

    const portfolioMap = {};
    for (const p of portfolios) {
      if (!portfolioMap[p.clientId]) portfolioMap[p.clientId] = { count: 0, totalValue: 0, riskScore: 0, performanceScore: 0 };
      portfolioMap[p.clientId].count += 1;
      portfolioMap[p.clientId].totalValue += p.totalValue || 0;
      portfolioMap[p.clientId].riskScore += p.riskScore || 0;
      portfolioMap[p.clientId].performanceScore += p.performanceScore || 0;
    }

    const alertMap = {};
    for (const a of alerts) {
      if (!alertMap[a.clientId]) alertMap[a.clientId] = { open: 0, high: 0 };
      if (a.status !== "resolved") alertMap[a.clientId].open += 1;
      if ((a.severity === "High" || a.severity === "Critical") && a.status !== "resolved") alertMap[a.clientId].high += 1;
    }

    const enriched = clients.map(c => {
      const pm = portfolioMap[c.id] || { count: 0, totalValue: 0, riskScore: 0, performanceScore: 0 };
      const am = alertMap[c.id] || { open: 0, high: 0 };
      return {
        ...c,
        portfolioCount: pm.count,
        totalPortfolioValue: parseFloat(pm.totalValue.toFixed(2)),
        avgRiskScore: pm.count > 0 ? parseFloat((pm.riskScore / pm.count).toFixed(2)) : 0,
        avgPerformance: pm.count > 0 ? parseFloat((pm.performanceScore / pm.count).toFixed(2)) : 0,
        openAlerts: am.open,
        highAlerts: am.high,
      };
    });

    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "Internal server error" }); }
});

// GET /clients/stats/risk-distribution
router.get("/stats/risk-distribution", async (req, res) => {
  try {
    const clients = await prisma.client.findMany({ select: { riskProfile: true } });
    const dist = {};
    for (const c of clients) { const k = c.riskProfile || "Unknown"; dist[k] = (dist[k] || 0) + 1; }
    res.json(Object.entries(dist).map(([name, value]) => ({ name, value })));
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch risk distribution" }); }
});

// GET /clients/stats/goal-distribution
router.get("/stats/goal-distribution", async (req, res) => {
  try {
    const clients = await prisma.client.findMany({ select: { investmentGoal: true } });
    const dist = {};
    for (const c of clients) { const k = c.investmentGoal || "Unknown"; dist[k] = (dist[k] || 0) + 1; }
    res.json(Object.entries(dist).map(([name, value]) => ({ name, value })));
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch goal distribution" }); }
});

// GET /clients/stats/aum-by-city
router.get("/stats/aum-by-city", async (req, res) => {
  try {
    const clients = await prisma.client.findMany({ select: { id: true, city: true } });
    const portfolios = await prisma.portfolio.findMany({ select: { clientId: true, totalValue: true } });
    const portfolioMap = {};
    for (const p of portfolios) portfolioMap[p.clientId] = (portfolioMap[p.clientId] || 0) + (p.totalValue || 0);
    const cityMap = {};
    for (const c of clients) {
      const city = c.city || "Unknown";
      if (!cityMap[city]) cityMap[city] = { count: 0, aum: 0 };
      cityMap[city].count += 1;
      cityMap[city].aum += portfolioMap[c.id] || 0;
    }
    const data = Object.entries(cityMap).map(([name, v]) => ({ name, count: v.count, aum: parseFloat(v.aum.toFixed(2)) })).sort((a, b) => b.aum - a.aum);
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch AUM by city" }); }
});

// GET /clients/:id
router.get("/:id", async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: "Client not found" });
    const portfolios = await prisma.portfolio.findMany({ where: { clientId: req.params.id } });
    const portfolioIds = portfolios.map(p => p.id);
    const [holdings, interactions, notes, riskAssessments] = await Promise.all([
      portfolioIds.length ? prisma.holding.findMany({ where: { portfolioId: { in: portfolioIds } } }) : [],
      prisma.clientInteraction.findMany({ where: { clientId: req.params.id }, orderBy: { interactionDate: "desc" }, take: 10 }),
      prisma.advisorNote.findMany({ where: { clientId: req.params.id }, orderBy: { createdAt: "desc" } }),
      prisma.riskAssessment.findMany({ where: { clientId: req.params.id }, orderBy: { assessmentDate: "desc" }, take: 1 }),
    ]);
    res.json({ ...client, portfolios, holdings, interactions, notes, riskAssessments });
  } catch (e) { console.error(e); res.status(500).json({ error: "Internal server error" }); }
});

module.exports = router;
