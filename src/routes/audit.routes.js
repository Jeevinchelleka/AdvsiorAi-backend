const express = require("express");
const prisma = require("../prisma/prisma");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const router = express.Router();

// GET /audit — admin and compliance only
router.get("/", authenticate, requireRole("admin", "compliance"), async (req, res) => {
  try {
    const { limit = 50, resource, action, role } = req.query;
    const where = {};
    if (resource) where.resource = resource;
    if (action)   where.action   = action;
    if (role)     where.userRole = role;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit) || 50, 200),
    });
    res.json(logs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// GET /audit/stats — summary stats
router.get("/stats", authenticate, requireRole("admin", "compliance"), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      select: { action: true, resource: true, userRole: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const byRole = {}, byResource = {}, byAction = {}, byStatus = {};
    for (const l of logs) {
      const r = l.userRole || "unknown";
      const res_ = l.resource || "unknown";
      const a = l.action || "unknown";
      const s = l.status || "unknown";
      byRole[r]     = (byRole[r]     || 0) + 1;
      byResource[res_] = (byResource[res_] || 0) + 1;
      byAction[a]   = (byAction[a]   || 0) + 1;
      byStatus[s]   = (byStatus[s]   || 0) + 1;
    }

    res.json({
      total: logs.length,
      byRole:     Object.entries(byRole).map(([name, value]) => ({ name, value })),
      byResource: Object.entries(byResource).map(([name, value]) => ({ name, value })),
      byAction:   Object.entries(byAction).map(([name, value]) => ({ name, value })),
      byStatus:   Object.entries(byStatus).map(([name, value]) => ({ name, value })),
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch audit stats" });
  }
});

module.exports = router;
