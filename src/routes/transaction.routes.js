const express = require("express");
const prisma = require("../prisma/prisma");

const router = express.Router();

// GET /transactions — all transactions, sorted by date desc
router.get("/", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { tradeDate: "desc" },
      take: 100,
    });
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// GET /transactions/stats/by-type — count and volume by transaction type
router.get("/stats/by-type", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      select: { transactionType: true, quantity: true, price: true },
    });

    const grouped = {};
    for (const t of transactions) {
      const key = t.transactionType || "Unknown";
      if (!grouped[key]) grouped[key] = { count: 0, volume: 0 };
      grouped[key].count += 1;
      grouped[key].volume += (t.quantity || 0) * (t.price || 0);
    }

    const data = Object.entries(grouped).map(([name, v]) => ({
      name,
      count: v.count,
      volume: parseFloat(v.volume.toFixed(2)),
    }));

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch transaction stats" });
  }
});

// GET /transactions/stats/monthly — transaction volume by month
router.get("/stats/monthly", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      select: { tradeDate: true, quantity: true, price: true, transactionType: true },
      orderBy: { tradeDate: "asc" },
    });

    const monthly = {};
    for (const t of transactions) {
      const d = new Date(t.tradeDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { buy: 0, sell: 0, count: 0 };
      const vol = (t.quantity || 0) * (t.price || 0);
      if ((t.transactionType || "").toLowerCase() === "buy") monthly[key].buy += vol;
      else monthly[key].sell += vol;
      monthly[key].count += 1;
    }

    const data = Object.entries(monthly).map(([month, v]) => ({
      month,
      buy: parseFloat(v.buy.toFixed(2)),
      sell: parseFloat(v.sell.toFixed(2)),
      count: v.count,
    }));

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch monthly transaction stats" });
  }
});

module.exports = router;
