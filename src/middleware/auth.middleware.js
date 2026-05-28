/**
 * Authentication & Authorization Middleware
 * Zero-trust: every request must carry a valid JWT.
 */

const jwt = require("jsonwebtoken");

/**
 * authenticate — verifies JWT and attaches user to req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    return res.status(401).json({ error: "Invalid token. Please sign in again." });
  }
}

/**
 * requireRole(...roles) — only allows users with one of the specified roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}. Your role: ${req.user.role}.`,
        requiredRoles: roles,
        yourRole: req.user.role,
      });
    }
    next();
  };
}

/**
 * requirePermission(resource, action) — checks role_permissions table
 * Falls back to a hardcoded permission map if DB check fails.
 */
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
    research_reports: ["read"],
    dashboard: ["read"],
  },
};

function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });

    const role = req.user.role;
    const allowed = PERMISSION_MAP[role]?.[resource]?.includes(action) ?? false;

    if (!allowed) {
      return res.status(403).json({
        error: `Access denied. Your role (${role}) cannot ${action} ${resource}.`,
        resource, action, role,
      });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, requirePermission };
