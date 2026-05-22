const express = require("express");
const prisma = require("../prisma/prisma");

const router = express.Router();

// GET /portfolios — all portfolios with holdings count
router.get("/", async (req, res) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      orderBy: { createdAt: "desc" },
    });

    const holdings = await prisma.holding.findMany({
      select: { portfolioId: true, allocationPercentage: true, currentPrice: true, purchasePrice: true, quantity: true },
    });

    const holdingMap = {};
    for (const h of holdings) {
      if (!holdingMap[h.portfolioId]) holdingMap[h.portfolioId] = { count: 0, value: 0 };
      holdingMap[h.portfolioId].count += 1;
      holdingMap[h.portfolioId].value += h.currentPrice * h.quantity;
    }

    const enriched = portfolios.map((p) => ({
      ...p,
      holdingsCount: holdingMap[p.id]?.count || 0,
      holdingsValue: parseFloat((holdingMap[p.id]?.value || 0).toFixed(2)),
    }));

    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch portfolios" });
  }
});

// GET /portfolios/:id — single portfolio with holdings and transactions
router.get("/:id", async (req, res) => {
  try {
    const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
    if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });

    const [holdings, transactions] = await Promise.all([
      prisma.holding.findMany({ where: { portfolioId: req.params.id } }),
      prisma.transaction.findMany({
        where: { portfolioId: req.params.id },
        orderBy: { tradeDate: "desc" },
        take: 20,
      }),
    ]);

    res.json({ ...portfolio, holdings, transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

module.exports = router;
