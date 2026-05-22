const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /recommendations — all recommendations with client info
router.get("/", async (req, res) => {
  try {
    const recs = await prisma.recommendation.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { firstName: true, lastName: true, riskProfile: true } } },
    });
    res.json(recs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

module.exports = router;
