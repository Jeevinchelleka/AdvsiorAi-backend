const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── Clear all tables in reverse FK order ────────────────────────────────────
  await prisma.advisorNote.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.watchlist.deleteMany();
  await prisma.clientInteraction.deleteMany();
  await prisma.portfolioSnapshot.deleteMany();
  await prisma.complianceAlert.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.aiMessage.deleteMany();
  await prisma.aiConversation.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.holding.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.marketData.deleteMany();
  await prisma.researchReport.deleteMany();
  // role_permissions and audit_logs may not exist yet — skip silently
  await prisma.rolePermission.deleteMany().catch(() => {});
  await prisma.auditLog.deleteMany().catch(() => {});
  console.log("✓ Cleared existing data");

  // ─── Users ───────────────────────────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      { name: "John Advisor",     email: "john.advisor@test.com",     password: "password123", role: "advisor" },
      { name: "Sarah Compliance", email: "sarah.compliance@test.com", password: "password123", role: "compliance" },
      { name: "Mike Operations",  email: "mike.ops@test.com",         password: "password123", role: "operations" },
      { name: "Emma Wealth",      email: "emma.wealth@test.com",      password: "password123", role: "advisor" },
      { name: "David Risk",       email: "david.risk@test.com",       password: "password123", role: "compliance" },
      { name: "Sophia Manager",   email: "sophia.manager@test.com",   password: "password123", role: "advisor" },
      { name: "James Finance",    email: "james.finance@test.com",    password: "password123", role: "operations" },
      { name: "Olivia Admin",     email: "olivia.admin@test.com",     password: "password123", role: "admin" },
      { name: "Daniel Advisor",   email: "daniel.advisor@test.com",   password: "password123", role: "advisor" },
      { name: "Isabella Support", email: "isabella.support@test.com", password: "password123", role: "operations" },
    ],
  });
  const users   = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const advisor = users.find(u => u.role === "advisor");
  console.log(`✓ Created ${users.length} users`);

  // ─── Clients ─────────────────────────────────────────────────────────────────
  await prisma.client.createMany({
    data: [
      { advisorId: advisor.id, firstName: "Robert",  lastName: "Smith",    email: "robert@test.com",   phone: "9876543210", riskProfile: "Moderate",     annualIncome: 120000, netWorth: 500000,  investmentGoal: "Retirement",          age: 45, occupation: "Software Engineer",  city: "New York",      country: "US", onboardingDate: new Date("2023-01-15"), lastReviewDate: new Date("2025-03-10"), relationshipStatus: "Married",  dependents: 2, riskScore: 6.5, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Emily",   lastName: "Johnson",  email: "emily@test.com",    phone: "9876543211", riskProfile: "Aggressive",   annualIncome: 150000, netWorth: 800000,  investmentGoal: "Wealth Growth",       age: 38, occupation: "Doctor",             city: "San Francisco", country: "US", onboardingDate: new Date("2022-06-20"), lastReviewDate: new Date("2025-04-15"), relationshipStatus: "Single",   dependents: 0, riskScore: 8.2, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "David",   lastName: "Wilson",   email: "david@test.com",    phone: "9876543212", riskProfile: "Conservative", annualIncome:  90000, netWorth: 300000,  investmentGoal: "Capital Preservation", age: 62, occupation: "Retired Executive",  city: "Miami",         country: "US", onboardingDate: new Date("2020-09-05"), lastReviewDate: new Date("2025-05-01"), relationshipStatus: "Married",  dependents: 1, riskScore: 3.2, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Sophia",  lastName: "Brown",    email: "sophia@test.com",   phone: "9876543213", riskProfile: "Moderate",     annualIncome: 110000, netWorth: 450000,  investmentGoal: "Education Planning",  age: 41, occupation: "Investment Banker",  city: "Boston",        country: "US", onboardingDate: new Date("2023-07-12"), lastReviewDate: new Date("2025-04-28"), relationshipStatus: "Divorced", dependents: 2, riskScore: 7.8, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Michael", lastName: "Taylor",   email: "michael@test.com",  phone: "9876543214", riskProfile: "Aggressive",   annualIncome: 200000, netWorth: 1000000, investmentGoal: "Long-Term Growth",    age: 35, occupation: "Tech Entrepreneur",  city: "Austin",        country: "US", onboardingDate: new Date("2021-11-03"), lastReviewDate: new Date("2025-03-22"), relationshipStatus: "Single",   dependents: 0, riskScore: 9.1, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Olivia",  lastName: "Anderson", email: "olivia@test.com",   phone: "9876543215", riskProfile: "Conservative", annualIncome:  85000, netWorth: 250000,  investmentGoal: "Income Stability",    age: 58, occupation: "Teacher",            city: "Seattle",       country: "US", onboardingDate: new Date("2022-02-14"), lastReviewDate: new Date("2025-02-10"), relationshipStatus: "Married",  dependents: 3, riskScore: 2.8, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "James",   lastName: "Thomas",   email: "james@test.com",    phone: "9876543216", riskProfile: "Moderate",     annualIncome: 130000, netWorth: 600000,  investmentGoal: "Retirement",          age: 50, occupation: "Business Owner",     city: "Chicago",       country: "US", onboardingDate: new Date("2021-03-10"), lastReviewDate: new Date("2025-02-20"), relationshipStatus: "Married",  dependents: 3, riskScore: 5.5, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Emma",    lastName: "Jackson",  email: "emma@test.com",     phone: "9876543217", riskProfile: "Aggressive",   annualIncome: 175000, netWorth: 950000,  investmentGoal: "High Returns",        age: 32, occupation: "Hedge Fund Analyst", city: "New York",      country: "US", onboardingDate: new Date("2024-01-08"), lastReviewDate: new Date("2025-05-10"), relationshipStatus: "Single",   dependents: 0, riskScore: 8.9, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Daniel",  lastName: "White",    email: "daniel@test.com",   phone: "9876543218", riskProfile: "Moderate",     annualIncome: 140000, netWorth: 700000,  investmentGoal: "Balanced Portfolio",  age: 47, occupation: "Lawyer",             city: "Los Angeles",   country: "US", onboardingDate: new Date("2022-09-19"), lastReviewDate: new Date("2025-04-05"), relationshipStatus: "Married",  dependents: 2, riskScore: 6.1, kycStatus: "verified" },
      { advisorId: advisor.id, firstName: "Ava",     lastName: "Harris",   email: "ava@test.com",      phone: "9876543219", riskProfile: "Conservative", annualIncome:  95000, netWorth: 350000,  investmentGoal: "Safe Investments",    age: 55, occupation: "Nurse",              city: "Phoenix",       country: "US", onboardingDate: new Date("2023-04-25"), lastReviewDate: new Date("2025-03-30"), relationshipStatus: "Divorced", dependents: 1, riskScore: 3.8, kycStatus: "verified" },
    ],
  });
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`✓ Created ${clients.length} clients`);

  // ─── Portfolios ──────────────────────────────────────────────────────────────
  const portfolioTemplates = [
    { name: "Retirement Growth",    value: 250000, risk: 6.5, perf: 8.2,  bench: "S&P 500",    inception: "2023-01-20", rebalanced: "2025-02-15", target: 8.0,  type: "Balanced" },
    { name: "Tech Innovation",      value: 400000, risk: 8.9, perf: 12.4, bench: "NASDAQ 100", inception: "2022-07-01", rebalanced: "2025-03-10", target: 12.0, type: "Growth" },
    { name: "Income Stability",     value: 180000, risk: 3.2, perf: 5.8,  bench: "AGG Bond",   inception: "2020-10-01", rebalanced: "2025-01-20", target: 5.0,  type: "Income" },
    { name: "Balanced Wealth",      value: 320000, risk: 5.5, perf: 7.6,  bench: "S&P 500",    inception: "2023-08-01", rebalanced: "2025-04-01", target: 7.5,  type: "Balanced" },
    { name: "Crypto Aggressive",    value: 500000, risk: 9.5, perf: 15.2, bench: "BTC Index",  inception: "2021-12-01", rebalanced: "2025-04-20", target: 15.0, type: "Aggressive" },
    { name: "Dividend Strategy",    value: 210000, risk: 4.1, perf: 6.1,  bench: "Dow Jones",  inception: "2022-03-01", rebalanced: "2025-02-01", target: 6.0,  type: "Income" },
    { name: "Long-Term Equity",     value: 370000, risk: 7.3, perf: 10.5, bench: "S&P 500",    inception: "2021-04-01", rebalanced: "2025-03-25", target: 10.0, type: "Growth" },
    { name: "Global Markets",       value: 290000, risk: 6.7, perf: 9.1,  bench: "MSCI World", inception: "2024-02-01", rebalanced: "2025-05-01", target: 9.0,  type: "Diversified" },
    { name: "Healthcare Focus",     value: 260000, risk: 5.9, perf: 8.3,  bench: "S&P 500",    inception: "2022-10-01", rebalanced: "2025-01-15", target: 8.5,  type: "Sector" },
    { name: "ETF Core Portfolio",   value: 340000, risk: 4.8, perf: 7.0,  bench: "S&P 500",    inception: "2023-05-01", rebalanced: "2025-03-05", target: 7.0,  type: "Passive" },
  ];

  await prisma.portfolio.createMany({
    data: clients.map((c, i) => ({
      clientId:         c.id,
      portfolioName:    portfolioTemplates[i].name,
      totalValue:       portfolioTemplates[i].value,
      riskScore:        portfolioTemplates[i].risk,
      performanceScore: portfolioTemplates[i].perf,
      benchmark:        portfolioTemplates[i].bench,
      inceptionDate:    new Date(portfolioTemplates[i].inception),
      lastRebalanced:   new Date(portfolioTemplates[i].rebalanced),
      targetReturn:     portfolioTemplates[i].target,
      currency:         "USD",
      portfolioType:    portfolioTemplates[i].type,
      status:           "active",
    })),
  });
  const portfolios = await prisma.portfolio.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`✓ Created ${portfolios.length} portfolios`);

  // ─── Holdings (10 per portfolio = 100 rows) ───────────────────────────────────
  const holdingTemplates = [
    { symbol: "AAPL",  assetType: "Stock",  quantity: 50,  purchasePrice: 180,   currentPrice: 220,    allocationPercentage: 15, sector: "Technology",     marketCapCategory: "Large Cap", beta: 1.20, dividendYield: 0.50 },
    { symbol: "TSLA",  assetType: "Stock",  quantity: 30,  purchasePrice: 240,   currentPrice: 350,    allocationPercentage: 12, sector: "Technology",     marketCapCategory: "Large Cap", beta: 1.80, dividendYield: 0.00 },
    { symbol: "NVDA",  assetType: "Stock",  quantity: 25,  purchasePrice: 400,   currentPrice: 950,    allocationPercentage: 18, sector: "Technology",     marketCapCategory: "Large Cap", beta: 1.60, dividendYield: 0.00 },
    { symbol: "MSFT",  assetType: "Stock",  quantity: 40,  purchasePrice: 280,   currentPrice: 420,    allocationPercentage: 10, sector: "Technology",     marketCapCategory: "Large Cap", beta: 1.10, dividendYield: 0.80 },
    { symbol: "GOOGL", assetType: "Stock",  quantity: 20,  purchasePrice: 120,   currentPrice: 170,    allocationPercentage: 8,  sector: "Technology",     marketCapCategory: "Large Cap", beta: 1.05, dividendYield: 0.00 },
    { symbol: "AMZN",  assetType: "Stock",  quantity: 18,  purchasePrice: 130,   currentPrice: 190,    allocationPercentage: 7,  sector: "Consumer",       marketCapCategory: "Large Cap", beta: 1.15, dividendYield: 0.00 },
    { symbol: "BTC",   assetType: "Crypto", quantity: 2,   purchasePrice: 45000, currentPrice: 105000, allocationPercentage: 10, sector: "Cryptocurrency", marketCapCategory: "Large Cap", beta: 2.50, dividendYield: 0.00 },
    { symbol: "ETH",   assetType: "Crypto", quantity: 10,  purchasePrice: 3000,  currentPrice: 7000,   allocationPercentage: 5,  sector: "Cryptocurrency", marketCapCategory: "Mid Cap",   beta: 3.10, dividendYield: 0.00 },
    { symbol: "SPY",   assetType: "ETF",    quantity: 35,  purchasePrice: 390,   currentPrice: 530,    allocationPercentage: 10, sector: "Diversified",    marketCapCategory: "Large Cap", beta: 1.00, dividendYield: 1.30 },
    { symbol: "QQQ",   assetType: "ETF",    quantity: 28,  purchasePrice: 310,   currentPrice: 490,    allocationPercentage: 5,  sector: "Technology",     marketCapCategory: "Large Cap", beta: 1.10, dividendYield: 0.60 },
  ];

  const holdingsData = portfolios.flatMap(p => holdingTemplates.map(h => ({ portfolioId: p.id, ...h })));
  await prisma.holding.createMany({ data: holdingsData });
  console.log(`✓ Created ${holdingsData.length} holdings`);

  // ─── Transactions (10 per portfolio = 100 rows) ───────────────────────────────
  const now = new Date();
  const txTemplates = [
    { transactionType: "BUY",  symbol: "AAPL",  quantity: 10, price: 210,    daysAgo: 10, status: "completed", fees: 9.99 },
    { transactionType: "SELL", symbol: "TSLA",  quantity: 5,  price: 340,    daysAgo: 8,  status: "completed", fees: 9.99 },
    { transactionType: "BUY",  symbol: "NVDA",  quantity: 8,  price: 920,    daysAgo: 7,  status: "completed", fees: 9.99 },
    { transactionType: "BUY",  symbol: "MSFT",  quantity: 12, price: 410,    daysAgo: 6,  status: "completed", fees: 9.99 },
    { transactionType: "SELL", symbol: "BTC",   quantity: 1,  price: 102000, daysAgo: 5,  status: "completed", fees: 25.00 },
    { transactionType: "BUY",  symbol: "SPY",   quantity: 15, price: 525,    daysAgo: 4,  status: "completed", fees: 9.99 },
    { transactionType: "BUY",  symbol: "ETH",   quantity: 3,  price: 6800,   daysAgo: 3,  status: "pending",   fees: 15.00 },
    { transactionType: "SELL", symbol: "AMZN",  quantity: 4,  price: 185,    daysAgo: 2,  status: "completed", fees: 9.99 },
    { transactionType: "BUY",  symbol: "QQQ",   quantity: 7,  price: 480,    daysAgo: 1,  status: "completed", fees: 9.99 },
    { transactionType: "BUY",  symbol: "GOOGL", quantity: 6,  price: 168,    daysAgo: 0,  status: "pending",   fees: 9.99 },
  ];

  const txData = portfolios.flatMap(p =>
    txTemplates.map(t => ({
      portfolioId:     p.id,
      transactionType: t.transactionType,
      symbol:          t.symbol,
      quantity:        t.quantity,
      price:           t.price,
      tradeDate:       new Date(now - t.daysAgo * 86400000),
      status:          t.status,
      fees:            t.fees,
      initiatedBy:     "advisor",
    }))
  );
  await prisma.transaction.createMany({ data: txData });
  console.log(`✓ Created ${txData.length} transactions`);

  // ─── Market Data ─────────────────────────────────────────────────────────────
  await prisma.marketData.createMany({
    data: [
      { symbol: "AAPL",  currentPrice: 220,    dailyChange:  2.5,  volume: 12000000, week52High: 237.23, week52Low: 164.08, peRatio: 32.5,  marketCap: 3500000000000, sector: "Technology",     assetType: "Stock" },
      { symbol: "TSLA",  currentPrice: 350,    dailyChange: -4.2,  volume: 18000000, week52High: 488.54, week52Low: 138.80, peRatio: 98.2,  marketCap:  950000000000, sector: "Technology",     assetType: "Stock" },
      { symbol: "NVDA",  currentPrice: 950,    dailyChange:  6.8,  volume: 25000000, week52High: 974.00, week52Low: 410.00, peRatio: 185.0, marketCap: 2400000000000, sector: "Technology",     assetType: "Stock" },
      { symbol: "MSFT",  currentPrice: 420,    dailyChange:  1.7,  volume:  9000000, week52High: 430.82, week52Low: 309.45, peRatio: 38.1,  marketCap: 3200000000000, sector: "Technology",     assetType: "Stock" },
      { symbol: "GOOGL", currentPrice: 170,    dailyChange: -0.8,  volume:  7000000, week52High: 191.75, week52Low: 120.21, peRatio: 24.8,  marketCap: 2100000000000, sector: "Technology",     assetType: "Stock" },
      { symbol: "AMZN",  currentPrice: 190,    dailyChange:  3.1,  volume:  8500000, week52High: 201.20, week52Low: 118.35, peRatio: 62.3,  marketCap: 1980000000000, sector: "Consumer",       assetType: "Stock" },
      { symbol: "BTC",   currentPrice: 105000, dailyChange:  5.5,  volume:  4000000, week52High: 108000, week52Low:  49000, peRatio: null,  marketCap: 2050000000000, sector: "Cryptocurrency", assetType: "Crypto" },
      { symbol: "ETH",   currentPrice: 7000,   dailyChange:  4.1,  volume:  3500000, week52High:   7200, week52Low:   1500, peRatio: null,  marketCap:  840000000000, sector: "Cryptocurrency", assetType: "Crypto" },
      { symbol: "SPY",   currentPrice: 530,    dailyChange:  0.9,  volume: 11000000, week52High: 542.00, week52Low: 410.00, peRatio: 22.1,  marketCap:  490000000000, sector: "Diversified",    assetType: "ETF" },
      { symbol: "QQQ",   currentPrice: 490,    dailyChange:  1.2,  volume:  9500000, week52High: 503.52, week52Low: 342.00, peRatio: 35.8,  marketCap:  210000000000, sector: "Technology",     assetType: "ETF" },
    ],
  });
  console.log("✓ Created 10 market data records");

  // ─── Research Reports ─────────────────────────────────────────────────────────
  await prisma.researchReport.createMany({
    data: [
      { title: "AI Boom in Technology Sector",          content: "AI companies continue to outperform market expectations. NVDA leads with 185% YoY revenue growth driven by data center demand. MSFT Azure AI services growing at 29% QoQ. Recommend overweight position in AI infrastructure plays.",                                                                                                      category: "Technology" },
      { title: "Federal Reserve Interest Rate Analysis", content: "Fed signals 2-3 rate cuts in 2025. Current fed funds rate at 5.25-5.50%. Rate cuts expected to benefit growth stocks and REITs. Bond yields likely to compress. Recommend increasing duration in fixed income portfolios.",                                                                                                                 category: "Macroeconomics" },
      { title: "EV Market Expansion Forecast",          content: "Global EV adoption reaching 18% of new car sales. TSLA maintains 19% market share despite increased competition. Battery costs declining 12% YoY. Recommend selective exposure to EV supply chain over pure-play manufacturers.",                                                                                                         category: "Automotive" },
      { title: "Crypto Regulation Update 2025",         content: "SEC approved 11 spot Bitcoin ETFs in January 2024. Institutional adoption accelerating with $15B inflows in Q1 2025. Ethereum ETF approval expected Q3 2025. Regulatory clarity improving — recommend 5-10% crypto allocation for aggressive profiles.",                                                                                  category: "Cryptocurrency" },
      { title: "Healthcare Innovation Report",          content: "GLP-1 drug market projected to reach $130B by 2030. AI-driven drug discovery reducing development timelines by 40%. Healthcare sector showing defensive characteristics with 8.3% average performance score. Recommend healthcare ETF for conservative portfolios.",                                                                        category: "Healthcare" },
      { title: "Global ETF Trends Q2 2025",             content: "Passive investing now represents 54% of total US fund assets. SPY and QQQ continue to dominate inflows. Factor ETFs outperforming in current environment. Low-cost index funds remain optimal for long-term wealth building.",                                                                                                            category: "Investment Strategy" },
      { title: "Semiconductor Industry Outlook",        content: "Global semiconductor market projected at $1.1T by 2030. AI chip demand growing 45% annually. NVDA, AMD, and TSMC positioned as primary beneficiaries. Supply chain normalization complete. Recommend overweight semiconductor exposure for growth portfolios.",                                                                            category: "Technology" },
      { title: "Retirement Planning Strategies 2025",   content: "Average retirement savings gap of $1.1M for Americans aged 55-64. Target-date funds underperforming custom allocations by 1.8% annually. Sequence-of-returns risk critical for clients within 5 years of retirement. Recommend gradual de-risking starting 7 years pre-retirement.",                                                    category: "Wealth Management" },
      { title: "Risk Management in Volatile Markets",   content: "VIX averaging 18.5 in 2025, elevated vs 2023 lows. Portfolio rebalancing quarterly reduces drawdown by 23% historically. Options hedging strategies cost-effective for portfolios above $500K. Recommend systematic rebalancing triggers at 5% drift from target allocation.",                                                            category: "Risk Management" },
      { title: "Emerging Markets Growth Report 2025",   content: "India GDP growth at 7.2%, fastest among major economies. China recovery slower than expected at 4.8%. Brazil and Mexico benefiting from nearshoring trends. EM equities trading at 35% discount to developed markets P/E. Recommend 10-15% EM allocation for diversified portfolios.",                                                  category: "Global Markets" },
    ],
  });
  console.log("✓ Created 10 research reports");

  // ─── Recommendations ─────────────────────────────────────────────────────────
  await prisma.recommendation.createMany({
    data: [
      { clientId: clients[0].id, recommendationType: "Rebalancing",      recommendationText: "Reduce TSLA exposure from 12% to 7% and reallocate to dividend stocks",                         confidenceScore: 0.92, reasoning: "Portfolio overexposed to volatile tech. Client risk profile is Moderate — TSLA beta of 1.8 exceeds tolerance." },
      { clientId: clients[1].id, recommendationType: "Growth",           recommendationText: "Increase NVDA allocation by 5% — strong AI sector tailwind supports continued growth",            confidenceScore: 0.91, reasoning: "Client is Aggressive profile with long time horizon. NVDA revenue growth 185% YoY driven by AI infrastructure demand." },
      { clientId: clients[2].id, recommendationType: "Income",           recommendationText: "Add 15% bond allocation (AGG ETF) to improve income stability and reduce volatility",             confidenceScore: 0.88, reasoning: "Conservative client approaching retirement. Current portfolio lacks fixed income. Bond allocation reduces portfolio beta to 0.6." },
      { clientId: clients[3].id, recommendationType: "Diversification",  recommendationText: "Add international ETF (VEA) — portfolio currently 100% US equities, lacks geographic spread",    confidenceScore: 0.84, reasoning: "Balanced portfolio missing international exposure. EM and developed market diversification reduces correlation risk." },
      { clientId: clients[4].id, recommendationType: "Risk",             recommendationText: "Reduce crypto allocation from 15% to 8% — exceeds aggressive profile safe threshold",            confidenceScore: 0.89, reasoning: "BTC and ETH combined at 15% creates excessive volatility. Even aggressive profiles should cap crypto at 10%." },
      { clientId: clients[5].id, recommendationType: "Dividend",         recommendationText: "Increase dividend stock allocation — add JNJ, KO, and PG for stable income stream",              confidenceScore: 0.80, reasoning: "Conservative client needs income stability. Dividend stocks provide 2-4% yield with lower volatility than growth stocks." },
      { clientId: clients[6].id, recommendationType: "Tax Optimization", recommendationText: "Move $50K from taxable account to Roth IRA — significant tax savings over 10-year horizon",      confidenceScore: 0.87, reasoning: "Client in 32% tax bracket. Roth conversion at current rates saves estimated $18K in taxes over retirement period." },
      { clientId: clients[7].id, recommendationType: "Upsell",           recommendationText: "Introduce structured products — client high net worth qualifies for principal-protected notes",   confidenceScore: 0.85, reasoning: "Client has $950K net worth and aggressive profile. Structured products offer upside participation with downside protection." },
      { clientId: clients[8].id, recommendationType: "Healthcare",       recommendationText: "Add healthcare sector ETF (XLV) — defensive characteristics suit balanced portfolio",            confidenceScore: 0.82, reasoning: "Healthcare sector showing 8.3% average performance with low correlation to tech holdings. Improves portfolio Sharpe ratio." },
      { clientId: clients[9].id, recommendationType: "Liquidity",        recommendationText: "Increase cash reserves to 8% — client may need liquidity for home purchase in 12 months",        confidenceScore: 0.79, reasoning: "Client mentioned potential real estate purchase. Maintaining 8% cash prevents forced selling at inopportune times." },
    ],
  });
  console.log("✓ Created 10 recommendations");

  // ─── Compliance Alerts ───────────────────────────────────────────────────────
  await prisma.complianceAlert.createMany({
    data: [
      { clientId: clients[0].id, severity: "High",   alertMessage: "Trade exceeds client risk tolerance — TSLA position at 12% vs 8% max for Moderate profile",       status: "open",          alertType: "Suitability" },
      { clientId: clients[1].id, severity: "Medium", alertMessage: "Suspicious high-frequency trading pattern detected — 15 trades in 48 hours",                      status: "investigating", alertType: "Trading Pattern" },
      { clientId: clients[2].id, severity: "Low",    alertMessage: "KYC documentation update required — annual review overdue by 30 days",                            status: "open",          alertType: "KYC" },
      { clientId: clients[3].id, severity: "High",   alertMessage: "Large crypto exposure detected — BTC+ETH at 15% exceeds 10% policy limit for aggressive profile",  status: "open",          alertType: "Concentration" },
      { clientId: clients[4].id, severity: "Medium", alertMessage: "Missing trade documentation for ETH purchase on 2025-05-25",                                      status: "resolved",      alertType: "Documentation", resolvedBy: "john.advisor@test.com", resolvedAt: new Date() },
      { clientId: clients[5].id, severity: "Low",    alertMessage: "Annual portfolio review overdue — last review was 90 days ago",                                    status: "open",          alertType: "Review" },
      { clientId: clients[6].id, severity: "High",   alertMessage: "Unauthorized trade attempt blocked — trade size exceeded account authorization level",             status: "resolved",      alertType: "Authorization", resolvedBy: "sarah.compliance@test.com", resolvedAt: new Date() },
      { clientId: clients[7].id, severity: "Medium", alertMessage: "Potential insider trading pattern detected — trades ahead of earnings announcements",              status: "investigating", alertType: "Insider Trading" },
      { clientId: clients[8].id, severity: "Low",    alertMessage: "Client suitability review needed — risk profile not updated after reported income change",         status: "open",          alertType: "Suitability" },
      { clientId: clients[9].id, severity: "High",   alertMessage: "AML compliance threshold exceeded — cash transaction pattern flagged by monitoring system",        status: "investigating", alertType: "AML" },
    ],
  });
  console.log("✓ Created 10 compliance alerts");

  // ─── Portfolio Snapshots (weekly, 6 months per portfolio = ~260 rows) ─────────
  const snapshots = [];
  for (const p of portfolios) {
    for (let daysAgo = 0; daysAgo <= 180; daysAgo += 7) {
      const factor = 0.85 + Math.random() * 0.30;
      snapshots.push({
        portfolioId:       p.id,
        snapshotDate:      new Date(now - daysAgo * 86400000),
        totalValue:        parseFloat((p.totalValue * factor).toFixed(2)),
        dailyReturn:       parseFloat(((Math.random() * 4) - 1.5).toFixed(3)),
        cumulativeReturn:  parseFloat(((Math.random() * 25) - 5).toFixed(2)),
        benchmarkValue:    parseFloat((100 * (1 + Math.random() * 0.20)).toFixed(2)),
      });
    }
  }
  await prisma.portfolioSnapshot.createMany({ data: snapshots });
  console.log(`✓ Created ${snapshots.length} portfolio snapshots`);

  // ─── Client Interactions (3 per client) ─────────────────────────────────────
  const iTypes    = ["meeting", "call", "email", "review"];
  const iSubjects = ["Quarterly Portfolio Review", "Rebalancing Discussion", "Tax Planning Session", "New Investment Opportunity", "Annual Financial Review"];
  const iNotes    = [
    "Client expressed satisfaction with portfolio performance. Discussed increasing equity exposure given strong market conditions.",
    "Reviewed current allocation. Client concerned about tech concentration. Agreed to reduce tech holdings by 5% next quarter.",
    "Discussed retirement timeline. Client wants to retire in 5 years. Need to shift to more conservative allocation.",
    "Client interested in ESG investing. Provided overview of available ESG funds matching their risk profile.",
  ];
  const iActions = ["Send updated portfolio report by end of week", "Schedule follow-up in 30 days to review rebalancing progress"];

  const interactions = clients.flatMap(c =>
    [0, 1, 2].map(() => ({
      clientId:        c.id,
      advisorId:       advisor.id,
      interactionType: iTypes[Math.floor(Math.random() * iTypes.length)],
      subject:         iSubjects[Math.floor(Math.random() * iSubjects.length)],
      notes:           iNotes[Math.floor(Math.random() * iNotes.length)],
      actionItems:     iActions[Math.floor(Math.random() * iActions.length)],
      sentiment:       ["positive", "neutral", "negative"][Math.floor(Math.random() * 3)],
      interactionDate: new Date(now - Math.floor(Math.random() * 90) * 86400000),
      nextFollowup:    new Date(now + (7 + Math.floor(Math.random() * 30)) * 86400000),
    }))
  );
  await prisma.clientInteraction.createMany({ data: interactions });
  console.log(`✓ Created ${interactions.length} client interactions`);

  // ─── Watchlist ───────────────────────────────────────────────────────────────
  await prisma.watchlist.createMany({
    data: [
      { advisorId: advisor.id, symbol: "AAPL",  assetType: "Stock",  targetPrice: 250,    alertPrice: 200,   notes: "Strong buy signal on dip below $200" },
      { advisorId: advisor.id, symbol: "NVDA",  assetType: "Stock",  targetPrice: 1200,   alertPrice: 900,   notes: "AI tailwind — monitor for entry point" },
      { advisorId: advisor.id, symbol: "MSFT",  assetType: "Stock",  targetPrice: 450,    alertPrice: 380,   notes: "Cloud growth story intact" },
      { advisorId: advisor.id, symbol: "BTC",   assetType: "Crypto", targetPrice: 120000, alertPrice: 80000, notes: "Halving cycle — accumulate on dips" },
      { advisorId: advisor.id, symbol: "ETH",   assetType: "Crypto", targetPrice: 5000,   alertPrice: 3000,  notes: "ETF approval catalyst" },
      { advisorId: advisor.id, symbol: "AMZN",  assetType: "Stock",  targetPrice: 220,    alertPrice: 175,   notes: "AWS re-acceleration expected" },
      { advisorId: advisor.id, symbol: "GOOGL", assetType: "Stock",  targetPrice: 200,    alertPrice: 160,   notes: "AI monetization undervalued" },
      { advisorId: advisor.id, symbol: "JPM",   assetType: "Stock",  targetPrice: 230,    alertPrice: 195,   notes: "Rate environment favorable for banks" },
    ],
  });
  console.log("✓ Created 8 watchlist items");

  // ─── Risk Assessments (1 per client) ─────────────────────────────────────────
  await prisma.riskAssessment.createMany({
    data: clients.map(c => {
      const con = c.riskProfile === "Conservative";
      const mod = c.riskProfile === "Moderate";
      return {
        clientId:             c.id,
        assessmentDate:       new Date(now - Math.floor(Math.random() * 365) * 86400000),
        riskToleranceScore:   con ? 3 + Math.random() * 1.5 : mod ? 5 + Math.random() * 1.5 : 7.5 + Math.random() * 2,
        timeHorizon:          con ? "short" : mod ? "medium" : "long",
        liquidityNeeds:       con ? "high" : mod ? "medium" : "low",
        incomeStability:      ["stable", "variable", "retired"][Math.floor(Math.random() * 3)],
        investmentExperience: ["beginner", "intermediate", "expert"][Math.floor(Math.random() * 3)],
        lossTolerance:        con ? "5%" : mod ? "10%" : "20%",
        recommendedProfile:   c.riskProfile,
      };
    }),
  });
  console.log(`✓ Created ${clients.length} risk assessments`);

  // ─── Advisor Notes (2 per client) ────────────────────────────────────────────
  const noteTitles   = ["Retirement Planning Update", "Portfolio Rebalancing Required", "Cross-sell Opportunity Identified", "Risk Profile Change Needed"];
  const noteContents = [
    "Client approaching retirement age. Should begin shifting allocation from growth to income-focused assets. Recommend increasing bond allocation by 15% over next 2 quarters.",
    "Tech sector overweight at 42% of portfolio. Market volatility increasing. Recommend reducing to 30% and diversifying into healthcare and consumer staples.",
    "Client has $500K in savings account earning minimal interest. Excellent opportunity to discuss managed portfolio expansion or structured products.",
    "Recent life event (new dependent) suggests need to review insurance coverage and update beneficiary designations. Schedule comprehensive review.",
  ];
  const noteTypes = ["opportunity", "concern", "action", "general"];

  const notes = clients.flatMap(c =>
    [0, 1].map(() => {
      const idx = Math.floor(Math.random() * noteTitles.length);
      return {
        clientId:  c.id,
        advisorId: advisor.id,
        noteType:  noteTypes[Math.floor(Math.random() * noteTypes.length)],
        title:     noteTitles[idx],
        content:   noteContents[idx],
        isPinned:  Math.random() > 0.7,
      };
    })
  );
  await prisma.advisorNote.createMany({ data: notes });
  console.log(`✓ Created ${notes.length} advisor notes`);

  // ─── Role Permissions ─────────────────────────────────────────────────────────
  const PERM_MAP = {
    admin:      { clients: ["read","write"], portfolios: ["read","write"], holdings: ["read","write"], transactions: ["read","write"], compliance_alerts: ["read","write"], recommendations: ["read","write"], market_data: ["read","write"], research_reports: ["read","write"], ai: ["read"], users: ["read","write"], audit_logs: ["read"], dashboard: ["read"], analytics: ["read"] },
    advisor:    { clients: ["read","write"], portfolios: ["read","write"], holdings: ["read","write"], transactions: ["read","write"], recommendations: ["read","write"], market_data: ["read"], research_reports: ["read"], ai: ["read"], compliance_alerts: ["read"], dashboard: ["read"], analytics: ["read"] },
    compliance: { clients: ["read"], portfolios: ["read"], holdings: ["read"], transactions: ["read"], compliance_alerts: ["read","write"], audit_logs: ["read"], recommendations: ["read"], market_data: ["read"], research_reports: ["read"], ai: ["read"], dashboard: ["read"], analytics: ["read"] },
    operations: { clients: ["read"], portfolios: ["read"], holdings: ["read"], transactions: ["read"], market_data: ["read"], research_reports: ["read"], dashboard: ["read"] },
  };

  const permRows = [];
  for (const [role, resources] of Object.entries(PERM_MAP)) {
    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) {
        permRows.push({ role, resource, action, allowed: true });
      }
    }
  }
  await prisma.rolePermission.createMany({ data: permRows, skipDuplicates: true }).catch(() => {
    console.log("  (role_permissions table not yet migrated — skipping)");
  });
  console.log(`✓ Created ${permRows.length} role permissions`);

  console.log("\n✅ Database seeded successfully!");
  console.log(`   Users: ${users.length} | Clients: ${clients.length} | Portfolios: ${portfolios.length}`);
  console.log(`   Holdings: ${holdingsData.length} | Transactions: ${txData.length} | Snapshots: ${snapshots.length}`);
  console.log(`   Market: 10 | Reports: 10 | Recommendations: 10 | Alerts: 10`);
  console.log(`   Interactions: ${interactions.length} | Notes: ${notes.length} | Watchlist: 8 | Risk Assessments: ${clients.length}`);
}

main()
  .catch(e => { console.error("\n❌ Seed failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
