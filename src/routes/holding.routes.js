const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /holdings — all holdings with P&L computed
router.get("/", async (req, res) => {
  try {
    const holdings = await prisma.holding.findMany({ orderBy: { allocationPercentage: "desc" } });
    const data = holdings.map(h => {
      const pnl = (h.purchasePrice || 0) > 0 ? ((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100 : 0;
      return { ...h, pnl: parseFloat(pnl.toFixed(2)), value: parseFloat(((h.currentPrice || 0) * (h.quantity || 0)).toFixed(2)) };
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch holdings" }); }
});

// GET /holdings/stats/by-sector
router.get("/stats/by-sector", async (req, res) => {
  try {
    const holdings = await prisma.holding.findMany({ select: { sector: true, currentPrice: true, quantity: true, allocationPercentage: true } });
    const grouped = {};
    for (const h of holdings) {
      const key = h.sector || "Other";
      if (!grouped[key]) grouped[key] = { value: 0, alloc: 0, count: 0 };
      grouped[key].value += (h.currentPrice || 0) * (h.quantity || 0);
      grouped[key].alloc += h.allocationPercentage || 0;
      grouped[key].count += 1;
    }
    const data = Object.entries(grouped).map(([name, v]) => ({
      name, value: parseFloat(v.value.toFixed(2)), allocation: parseFloat(v.alloc.toFixed(1)), count: v.count,
    })).sort((a, b) => b.value - a.value);
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch sector stats" }); }
});

module.exports = router;
