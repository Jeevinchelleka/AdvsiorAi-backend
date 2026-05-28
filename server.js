const express    = require("express");
const http       = require("http");
const cors       = require("cors");
const compression= require("compression");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
require("dotenv").config();

// ─── Hard defaults so the app never breaks on bad Railway env vars ────────────
if (!process.env.GEMINI_MODEL || !process.env.GEMINI_MODEL.includes("flash")) {
  process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
}
if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes("supabase.com/dashboard")) {
  process.env.SUPABASE_URL = "https://yigrmierugfllnxtznjd.supabase.co";
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "your-jwt-secret") {
  process.env.JWT_SECRET = "advisorai_super_secret_key";
}

const { authenticate, requirePermission } = require("./src/middleware/auth.middleware");
const { maskResponse }  = require("./src/middleware/mask.middleware");
const { auditLog }      = require("./src/middleware/audit.middleware");

const app        = express();
const httpServer = http.createServer(app);

// ─── Socket.io  (Knowledge Layer: real-time event streaming) ─────────────────
const { Server } = require("socket.io");
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});
// Make io accessible everywhere via app.locals
app.locals.io = io;
require("./src/services/realtime/socket.service")(io);

// ─── Security & compression ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return cb(null, true);
    if (origin.includes(".vercel.app")) return cb(null, true);
    const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (allowed.includes(origin)) return cb(null, true);
    cb(null, true); // open during development
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

// ─── API Gateway: global rate limiter ────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 200,              // 200 req / min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
}));

// Stricter limit for AI endpoints (expensive)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "AI rate limit reached. Please wait a moment." },
});

// ─── Public routes ────────────────────────────────────────────────────────────
app.use("/auth",   require("./src/routes/auth.routes"));
app.use("/health", require("./src/routes/health.routes"));
app.get("/", (req, res) => res.json({ message: "AdvisorAI Backend — Section 7 Architecture", version: "2.0" }));

// ─── Protected routes ─────────────────────────────────────────────────────────
app.use(authenticate);
app.use(maskResponse);

app.use("/dashboard",
  requirePermission("dashboard", "read"),
  require("./src/routes/dashboard.routes")
);
app.use("/ai",
  aiLimiter,
  requirePermission("ai", "read"),
  require("./src/routes/ai.routes")
);
app.use("/clients",
  requirePermission("clients", "read"),
  auditLog("clients", "read"),
  require("./src/routes/client.routes")
);
app.use("/portfolios",
  requirePermission("portfolios", "read"),
  require("./src/routes/portfolio.routes")
);
app.use("/holdings",
  requirePermission("holdings", "read"),
  require("./src/routes/holding.routes")
);
app.use("/transactions",
  requirePermission("transactions", "read"),
  require("./src/routes/transaction.routes")
);
app.use("/compliance",
  requirePermission("compliance_alerts", "read"),
  auditLog("compliance_alerts", "read"),
  require("./src/routes/compliance.routes")
);
app.use("/market",
  requirePermission("market_data", "read"),
  require("./src/routes/market.routes")
);
app.use("/recommendations",
  requirePermission("recommendations", "read"),
  require("./src/routes/recommendations.routes")
);
app.use("/research",
  requirePermission("research_reports", "read"),
  require("./src/routes/research.routes")
);
app.use("/conversations",
  requirePermission("ai", "read"),
  require("./src/routes/conversations.routes")
);
app.use("/users",  require("./src/routes/user.routes"));
app.use("/audit",  require("./src/routes/audit.routes"));

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Socket.io real-time layer active");
});
