const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /market — all market data
router.get("/", async (req, res) => {
  try {
    const data = await prisma.marketData.findMany({
      orderBy: { updatedAt: "desc" },
    });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
});

module.exports = router;
