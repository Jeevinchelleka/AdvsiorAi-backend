const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/ai",            require("./src/routes/ai.routes"));
app.use("/auth",          require("./src/routes/auth.routes"));
app.use("/users",         require("./src/routes/user.routes"));
app.use("/clients",       require("./src/routes/client.routes"));
app.use("/portfolios",    require("./src/routes/portfolio.routes"));
app.use("/holdings",      require("./src/routes/holding.routes"));
app.use("/transactions",  require("./src/routes/transaction.routes"));
app.use("/dashboard",     require("./src/routes/dashboard.routes"));
app.use("/compliance",    require("./src/routes/compliance.routes"));
app.use("/market",        require("./src/routes/market.routes"));
app.use("/recommendations", require("./src/routes/recommendations.routes"));
app.use("/research",      require("./src/routes/research.routes"));
app.use("/conversations", require("./src/routes/conversations.routes"));
app.use("/health",        require("./src/routes/health.routes"));

app.get("/", (req, res) => res.json({ message: "Advisor AI Backend Running" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
