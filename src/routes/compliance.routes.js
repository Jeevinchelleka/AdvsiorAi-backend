const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /compliance/alerts
router.get("/alerts", async (req, res) => {
  try {
    const alerts = await prisma.complianceAlert.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { firstName: true, lastName: true, email: true, riskProfile: true, city: true } } },
    });
    res.json(alerts);
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch compliance alerts" }); }
});

// GET /compliance/stats
router.get("/stats", async (req, res) => {
  try {
    const alerts = await prisma.complianceAlert.findMany({ select: { severity: true, status: true, alertType: true } });
    const bySeverity = {}, byStatus = {}, byType = {};
    for (const a of alerts) {
      const sev = a.severity || "Unknown";
      const sta = a.status  || "Unknown";
      const typ = a.alertType || "General";
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      byStatus[sta]   = (byStatus[sta]   || 0) + 1;
      byType[typ]     = (byType[typ]     || 0) + 1;
    }
    res.json({
      total: alerts.length,
      bySeverity: Object.entries(bySeverity).map(([name, value]) => ({ name, value })),
      byStatus:   Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      byType:     Object.entries(byType).map(([name, value]) => ({ name, value })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch compliance stats" }); }
});

// PATCH /compliance/alerts/:id
router.patch("/alerts/:id", async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  try {
    const updateData = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status.toLowerCase() === "resolved") {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = "Advisor";
      } else {
        updateData.resolvedAt = null;
        updateData.resolvedBy = null;
      }
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const updatedAlert = await prisma.complianceAlert.update({
      where: { id },
      data: updateData,
      include: { client: { select: { firstName: true, lastName: true, email: true, riskProfile: true, city: true } } },
    });
    res.json(updatedAlert);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update compliance alert" });
  }
});

module.exports = router;
