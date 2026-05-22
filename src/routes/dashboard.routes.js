const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /dashboard/summary — all KPIs
router.get("/summary", async (req, res) => {
  try {
    const [totalClients, totalPortfolios, totalTransactions, portfolios, openAlerts, totalRecs] =
      await Promise.all([
        prisma.client.count(),
        prisma.portfolio.count(),
        prisma.transaction.count(),
        prisma.portfolio.findMany({ select: { totalValue: true, riskScore: true, performanceScore: true } }),
        prisma.complianceAlert.count({ where: { status: { not: "resolved" } } }),
        prisma.recommendation.count(),
      ]);

    const totalAssets    = portfolios.reduce((s, p) => s + (p.totalValue || 0), 0);
    const avgRiskScore   = portfolios.length ? portfolios.reduce((s, p) => s + (p.riskScore || 0), 0) / portfolios.length : 0;
    const avgPerformance = portfolios.length ? portfolios.reduce((s, p) => s + (p.performanceScore || 0), 0) / portfolios.length : 0;

    res.json({
      totalClients, totalPortfolios, totalTransactions,
      totalAssets: parseFloat(totalAssets.toFixed(2)),
      avgRiskScore: parseFloat(avgRiskScore.toFixed(2)),
      avgPerformance: parseFloat(avgPerformance.toFixed(2)),
      openAlerts, totalRecs,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch summary" }); }
});

// GET /dashboard/allocation — by asset type from holdings
router.get("/allocation", async (req, res) => {
  try {
    const holdings = await prisma.holding.findMany({ select: { assetType: true, allocationPercentage: true, currentPrice: true, quantity: true } });
    const grouped = {};
    for (const h of holdings) {
      const type = h.assetType || "Other";
      if (!grouped[type]) grouped[type] = { alloc: 0, value: 0 };
      grouped[type].alloc += h.allocationPercentage || 0;
      grouped[type].value += (h.currentPrice || 0) * (h.quantity || 0);
    }
    const totalAlloc = Object.values(grouped).reduce((s, v) => s + v.alloc, 0);
    const data = Object.entries(grouped).map(([name, v]) => ({
      name,
      value: totalAlloc > 0 ? parseFloat(((v.alloc / totalAlloc) * 100).toFixed(1)) : 0,
      marketValue: parseFloat(v.value.toFixed(2)),
    })).sort((a, b) => b.value - a.value);
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch allocation" }); }
});

// GET /dashboard/sector-allocation — by sector from holdings
router.get("/sector-allocation", async (req, res) => {
  try {
    const holdings = await prisma.holding.findMany({ select: { sector: true, allocationPercentage: true, currentPrice: true, quantity: true } });
    const grouped = {};
    for (const h of holdings) {
      const sector = h.sector || "Other";
      if (!grouped[sector]) grouped[sector] = { alloc: 0, value: 0 };
      grouped[sector].alloc += h.allocationPercentage || 0;
      grouped[sector].value += (h.currentPrice || 0) * (h.quantity || 0);
    }
    const totalAlloc = Object.values(grouped).reduce((s, v) => s + v.alloc, 0);
    const data = Object.entries(grouped).map(([name, v]) => ({
      name,
      value: totalAlloc > 0 ? parseFloat(((v.alloc / totalAlloc) * 100).toFixed(1)) : 0,
      marketValue: parseFloat(v.value.toFixed(2)),
    })).sort((a, b) => b.value - a.value);
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch sector allocation" }); }
});

// GET /dashboard/performance — portfolio AUM by month (from createdAt)
router.get("/performance", async (req, res) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      select: { totalValue: true, createdAt: true, performanceScore: true },
      orderBy: { createdAt: "asc" },
    });
    const monthly = {};
    for (const p of portfolios) {
      const d = new Date(p.createdAt);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      if (!monthly[key]) monthly[key] = { value: 0, count: 0, perf: 0 };
      monthly[key].value += p.totalValue || 0;
      monthly[key].count += 1;
      monthly[key].perf  += p.performanceScore || 0;
    }
    const data = Object.entries(monthly).map(([month, v]) => ({
      month,
      value: parseFloat(v.value.toFixed(2)),
      avgPerformance: v.count > 0 ? parseFloat((v.perf / v.count).toFixed(2)) : 0,
    }));
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch performance" }); }
});

// GET /dashboard/risk-alerts — real compliance alerts + auto-generated
router.get("/risk-alerts", async (req, res) => {
  try {
    const [alerts, holdings] = await Promise.all([
      prisma.complianceAlert.findMany({
        where: { status: { not: "resolved" } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { client: { select: { firstName: true, lastName: true } } },
      }),
      prisma.holding.findMany({ select: { symbol: true, assetType: true, allocationPercentage: true, currentPrice: true, purchasePrice: true } }),
    ]);

    const mapped = alerts.map(a => ({
      title: a.alertMessage || "Alert",
      detail: a.client ? `${a.client.firstName} ${a.client.lastName}` : null,
      severity: a.severity || "Medium",
      status: a.status,
      type: a.alertType,
    }));

    for (const h of holdings) {
      if ((h.allocationPercentage || 0) > 25) {
        mapped.push({ title: `High ${h.symbol} Concentration`, detail: `${h.allocationPercentage?.toFixed(1)}% exceeds 25% limit`, severity: h.allocationPercentage > 35 ? "Critical" : "High", status: "open", type: "Concentration" });
      }
      const pnl = h.purchasePrice > 0 ? ((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100 : 0;
      if (pnl < -15) {
        mapped.push({ title: `${h.symbol} Significant Loss`, detail: `Down ${Math.abs(pnl).toFixed(1)}% from cost`, severity: pnl < -25 ? "Critical" : "High", status: "open", type: "P&L" });
      }
    }

    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    mapped.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
    res.json(mapped.slice(0, 10));
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch risk alerts" }); }
});

// GET /dashboard/top-holdings — top 10 by allocation
router.get("/top-holdings", async (req, res) => {
  try {
    const holdings = await prisma.holding.findMany({ orderBy: { allocationPercentage: "desc" }, take: 10 });
    const data = holdings.map(h => {
      const pnl = (h.purchasePrice || 0) > 0 ? ((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100 : 0;
      return {
        symbol: h.symbol, type: h.assetType, sector: h.sector,
        quantity: h.quantity, purchasePrice: h.purchasePrice, currentPrice: h.currentPrice,
        value: parseFloat(((h.currentPrice || 0) * (h.quantity || 0)).toFixed(2)),
        allocation: parseFloat((h.allocationPercentage || 0).toFixed(1)),
        pnl: parseFloat(pnl.toFixed(2)),
        beta: h.beta, dividendYield: h.dividendYield,
      };
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch top holdings" }); }
});

// GET /dashboard/market-ticker
router.get("/market-ticker", async (req, res) => {
  try {
    const data = await prisma.marketData.findMany({ orderBy: { updatedAt: "desc" } });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch market ticker" }); }
});

// GET /dashboard/recommendations
router.get("/recommendations", async (req, res) => {
  try {
    const recs = await prisma.recommendation.findMany({
      orderBy: { createdAt: "desc" }, take: 6,
      include: { client: { select: { firstName: true, lastName: true, riskProfile: true } } },
    });
    res.json(recs);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch recommendations" }); }
});

// GET /dashboard/client-segments — AUM by risk profile
router.get("/client-segments", async (req, res) => {
  try {
    const clients = await prisma.client.findMany({ select: { riskProfile: true, netWorth: true } });
    const portfolios = await prisma.portfolio.findMany({ select: { clientId: true, totalValue: true } });
    const portfolioMap = {};
    for (const p of portfolios) {
      portfolioMap[p.clientId] = (portfolioMap[p.clientId] || 0) + (p.totalValue || 0);
    }
    const segments = {};
    for (const c of clients) {
      const key = c.riskProfile || "Unknown";
      if (!segments[key]) segments[key] = { count: 0, aum: 0, netWorth: 0 };
      segments[key].count += 1;
      segments[key].aum += portfolioMap[c.id] || 0;
      segments[key].netWorth += c.netWorth || 0;
    }
    const data = Object.entries(segments).map(([name, v]) => ({
      name, count: v.count,
      aum: parseFloat(v.aum.toFixed(2)),
      avgNetWorth: v.count > 0 ? parseFloat((v.netWorth / v.count).toFixed(2)) : 0,
    }));
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch client segments" }); }
});

module.exports = router;
