const express = require("express");
const prisma = require("../prisma/prisma");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const router = express.Router();

// GET /users — admin only
router.get("/", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
