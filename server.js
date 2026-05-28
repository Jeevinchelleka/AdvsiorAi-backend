const express = require("express");
const cors = require("cors");
const compression = require("compression");
require("dotenv").config();

const { authenticate, requirePermission } = require("./src/middleware/auth.middleware");
const { maskResponse } = require("./src/middleware/mask.middleware");
const { auditLog } = require("./src/middleware/audit.middleware");

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

// ─── Public routes (no auth) ──────────────────────────────────────────────────
app.use("/auth",   require("./src/routes/auth.routes"));
app.use("/health", require("./src/routes/health.routes"));
app.get("/", (req, res) => res.json({ message: "Advisor AI Backend Running" }));

// ─── Protected routes — all require valid JWT ─────────────────────────────────
// Apply authenticate + maskResponse globally to all routes below
app.use(authenticate);
app.use(maskResponse);

// Dashboard & Analytics (read-only, all roles with dashboard permission)
app.use("/dashboard",
  requirePermission("dashboard", "read"),
  require("./src/routes/dashboard.routes")
);

// AI routes — advisor, compliance, admin only
app.use("/ai",
  requirePermission("ai", "read"),
  require("./src/routes/ai.routes")
);

// Clients
app.use("/clients",
  requirePermission("clients", "read"),
  auditLog("clients", "read"),
  require("./src/routes/client.routes")
);

// Portfolios
app.use("/portfolios",
  requirePermission("portfolios", "read"),
  require("./src/routes/portfolio.routes")
);

// Holdings
app.use("/holdings",
  requirePermission("holdings", "read"),
  require("./src/routes/holding.routes")
);

// Transactions
app.use("/transactions",
  requirePermission("transactions", "read"),
  require("./src/routes/transaction.routes")
);

// Compliance — advisor (read), compliance (read+write), admin (read+write)
app.use("/compliance",
  requirePermission("compliance_alerts", "read"),
  auditLog("compliance_alerts", "read"),
  require("./src/routes/compliance.routes")
);

// Market data
app.use("/market",
  requirePermission("market_data", "read"),
  require("./src/routes/market.routes")
);

// Recommendations
app.use("/recommendations",
  requirePermission("recommendations", "read"),
  require("./src/routes/recommendations.routes")
);

// Research reports
app.use("/research",
  requirePermission("research_reports", "read"),
  require("./src/routes/research.routes")
);

// AI Conversations
app.use("/conversations",
  requirePermission("ai", "read"),
  require("./src/routes/conversations.routes")
);

// Users — admin only (enforced inside route)
app.use("/users", require("./src/routes/user.routes"));

// Audit logs — admin + compliance only (enforced inside route)
app.use("/audit", require("./src/routes/audit.routes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
