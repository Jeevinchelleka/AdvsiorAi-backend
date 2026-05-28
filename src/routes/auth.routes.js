const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma/prisma");
const cache = require("../lib/cache");
const { authenticate } = require("../middleware/auth.middleware");
const { auditLog } = require("../middleware/audit.middleware");

const router = express.Router();

// POST /auth/login
router.post("/login", auditLog("auth", "login"), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Support both bcrypt hashes and plain-text passwords (dev seed data)
    let valid = false;
    if (user.password?.startsWith("$2")) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      // Plain text — compare directly (dev only) and upgrade to hash
      valid = user.password === password;
      if (valid) {
        // Silently upgrade to bcrypt hash
        const hashed = await bcrypt.hash(password, 12);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } }).catch(() => {});
      }
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Return user without password
    const { password: _pw, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  } catch (e) {
    console.error("[auth/login]", e.message);
    return res.status(500).json({ error: "Login failed." });
  }
});

// GET /auth/me — cached user fetch (avoids DB hit on every page load)
router.get("/me", authenticate, async (req, res) => {
  const key = `user:${req.user.id}`;
  const hit = cache.get(key);
  if (hit) return res.json(hit);
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found." });
    const { password: _pw, ...safeUser } = user;
    cache.set(key, safeUser, 5 * 60_000); // 5 minutes
    return res.json(safeUser);
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch user." });
  }
});

// GET /auth/permissions — get permissions for current user's role
router.get("/permissions", authenticate, (req, res) => {
  const PERMISSION_MAP = {
    admin: {
      clients: ["read", "write"], portfolios: ["read", "write"],
      holdings: ["read", "write"], transactions: ["read", "write"],
      compliance_alerts: ["read", "write"], recommendations: ["read", "write"],
      market_data: ["read", "write"], research_reports: ["read", "write"],
      ai: ["read"], users: ["read", "write"], audit_logs: ["read"],
      dashboard: ["read"], analytics: ["read"],
    },
    advisor: {
      clients: ["read", "write"], portfolios: ["read", "write"],
      holdings: ["read", "write"], transactions: ["read", "write"],
      recommendations: ["read", "write"], market_data: ["read"],
      research_reports: ["read"], ai: ["read"],
      compliance_alerts: ["read"],
      dashboard: ["read"], analytics: ["read"],
    },
    compliance: {
      clients: ["read"], portfolios: ["read"], holdings: ["read"],
      transactions: ["read"], compliance_alerts: ["read", "write"],
      audit_logs: ["read"], recommendations: ["read"],
      market_data: ["read"], research_reports: ["read"], ai: ["read"],
      dashboard: ["read"], analytics: ["read"],
    },
    operations: {
      clients: ["read"], portfolios: ["read"], holdings: ["read"],
      transactions: ["read"], market_data: ["read"],
      research_reports: ["read"], dashboard: ["read"],
    },
  };

  const role = req.user.role;
  const permissions = PERMISSION_MAP[role] || {};
  return res.json({ role, permissions });
});

module.exports = router;
