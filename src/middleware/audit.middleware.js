/**
 * Audit Logging Middleware
 * Logs every authenticated action to audit_logs table.
 */

const prisma = require("../prisma/prisma");

/**
 * auditLog(resource, action) — logs the request after it completes
 */
function auditLog(resource, action) {
  return (req, res, next) => {
    // Capture original json method to intercept response
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Log asynchronously — don't block the response
      setImmediate(async () => {
        try {
          await prisma.auditLog.create({
            data: {
              userId:     req.user?.id     || null,
              userRole:   req.user?.role   || "anonymous",
              action,
              resource,
              resourceId: req.params?.id   || null,
              details:    JSON.stringify({
                method: req.method,
                path:   req.path,
                query:  req.query,
                status: res.statusCode,
              }),
              ipAddress:  req.ip || req.connection?.remoteAddress || null,
              userAgent:  req.headers["user-agent"] || null,
              status:     res.statusCode < 400 ? "success" : "failure",
            },
          });
        } catch (e) {
          // Audit log failure must never break the app
          console.warn("[audit] Failed to write audit log:", e.message);
        }
      });
      return originalJson(body);
    };
    next();
  };
}

module.exports = { auditLog };
