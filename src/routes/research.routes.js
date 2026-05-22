const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /research — all research reports
router.get("/", async (req, res) => {
  try {
    const reports = await prisma.researchReport.findMany({
      orderBy: { uploadedAt: "desc" },
    });
    res.json(reports);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch research reports" });
  }
});

module.exports = router;
