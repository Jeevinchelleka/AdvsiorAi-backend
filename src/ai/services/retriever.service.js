const prisma = require("../../prisma/prisma");

const RECORD_LIMIT = 50; // enough to cover all seeded rows

async function fetchRecords(table, query) {
  const q = (query || "").trim().toLowerCase();
  const hasQuery = q.length > 0;

  try {
    switch (table) {
      case "clients": {
        const where = hasQuery ? {
          OR: [
            { firstName:     { contains: q, mode: "insensitive" } },
            { lastName:      { contains: q, mode: "insensitive" } },
            { email:         { contains: q, mode: "insensitive" } },
            { riskProfile:   { contains: q, mode: "insensitive" } },
            { investmentGoal:{ contains: q, mode: "insensitive" } },
            { occupation:    { contains: q, mode: "insensitive" } },
            { city:          { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.client.findMany({ where, orderBy: { createdAt: "asc" }, take: RECORD_LIMIT });
      }

      case "users": {
        const where = hasQuery ? {
          OR: [
            { name:  { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { role:  { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.user.findMany({ where, orderBy: { createdAt: "asc" }, take: RECORD_LIMIT });
      }

      case "portfolios": {
        const where = hasQuery ? {
          OR: [
            { portfolioName: { contains: q, mode: "insensitive" } },
            { portfolioType: { contains: q, mode: "insensitive" } },
            { benchmark:     { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.portfolio.findMany({
          where, orderBy: { totalValue: "desc" }, take: RECORD_LIMIT,
          include: { client: { select: { firstName: true, lastName: true, riskProfile: true } } },
        });
      }

      case "holdings": {
        const where = hasQuery ? {
          OR: [
            { symbol:    { contains: q, mode: "insensitive" } },
            { assetType: { contains: q, mode: "insensitive" } },
            { sector:    { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.holding.findMany({
          where, orderBy: { allocationPercentage: "desc" }, take: RECORD_LIMIT,
        });
      }

      case "transactions": {
        const where = hasQuery ? {
          OR: [
            { symbol:          { contains: q, mode: "insensitive" } },
            { transactionType: { contains: q, mode: "insensitive" } },
            { status:          { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.transaction.findMany({
          where, orderBy: { tradeDate: "desc" }, take: RECORD_LIMIT,
        });
      }

      case "compliance_alerts": {
        const where = hasQuery ? {
          OR: [
            { alertMessage: { contains: q, mode: "insensitive" } },
            { severity:     { contains: q, mode: "insensitive" } },
            { status:       { contains: q, mode: "insensitive" } },
            { alertType:    { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.complianceAlert.findMany({
          where, orderBy: { createdAt: "desc" }, take: RECORD_LIMIT,
          include: { client: { select: { firstName: true, lastName: true, riskProfile: true } } },
        });
      }

      case "recommendations": {
        const where = hasQuery ? {
          OR: [
            { recommendationType: { contains: q, mode: "insensitive" } },
            { recommendationText: { contains: q, mode: "insensitive" } },
            { reasoning:          { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.recommendation.findMany({
          where, orderBy: { confidenceScore: "desc" }, take: RECORD_LIMIT,
          include: { client: { select: { firstName: true, lastName: true } } },
        });
      }

      case "market_data": {
        const where = hasQuery ? {
          OR: [
            { symbol:    { contains: q, mode: "insensitive" } },
            { sector:    { contains: q, mode: "insensitive" } },
            { assetType: { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.marketData.findMany({
          where, orderBy: { marketCap: "desc" }, take: RECORD_LIMIT,
        });
      }

      case "research_reports": {
        const where = hasQuery ? {
          OR: [
            { title:    { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
            { content:  { contains: q, mode: "insensitive" } },
          ],
        } : {};
        return await prisma.researchReport.findMany({
          where, orderBy: { uploadedAt: "desc" }, take: RECORD_LIMIT,
        });
      }

      default:
        return [];
    }
  } catch (err) {
    console.warn(`[retriever] Failed to fetch ${table}:`, err.message);
    return [];
  }
}

function formatRecord(table, row) {
  if (!row) return "";
  switch (table) {
    case "clients":
      return `CLIENT: ${row.firstName} ${row.lastName} | Risk: ${row.riskProfile} | Age: ${row.age ?? "N/A"} | Occupation: ${row.occupation ?? "N/A"} | City: ${row.city ?? "N/A"} | Income: $${row.annualIncome ?? "N/A"} | Net Worth: $${row.netWorth ?? "N/A"} | Goal: ${row.investmentGoal ?? "N/A"} | KYC: ${row.kycStatus ?? "N/A"} | Risk Score: ${row.riskScore ?? "N/A"}/10`;

    case "users":
      return `USER: ${row.name} | Email: ${row.email} | Role: ${row.role}`;

    case "portfolios": {
      const owner = row.client ? `${row.client.firstName} ${row.client.lastName}` : row.clientId;
      return `PORTFOLIO: "${row.portfolioName}" | Owner: ${owner} | Value: $${row.totalValue} | Risk Score: ${row.riskScore}/10 | Performance: ${row.performanceScore}% | Type: ${row.portfolioType} | Benchmark: ${row.benchmark} | Status: ${row.status}`;
    }

    case "holdings": {
      const pnl = row.purchasePrice > 0 ? (((row.currentPrice - row.purchasePrice) / row.purchasePrice) * 100).toFixed(1) : "N/A";
      return `HOLDING: ${row.symbol} (${row.assetType}) | Qty: ${row.quantity} | Buy: $${row.purchasePrice} | Current: $${row.currentPrice} | P&L: ${pnl}% | Allocation: ${row.allocationPercentage}% | Sector: ${row.sector ?? "N/A"} | Beta: ${row.beta ?? "N/A"}`;
    }

    case "transactions":
      return `TRANSACTION: ${row.transactionType} ${row.symbol} | Qty: ${row.quantity} @ $${row.price} | Date: ${row.tradeDate ? new Date(row.tradeDate).toISOString().split("T")[0] : "N/A"} | Status: ${row.status} | Fees: $${row.fees ?? 0}`;

    case "compliance_alerts": {
      const c = row.client ? `${row.client.firstName} ${row.client.lastName}` : "Unknown";
      return `COMPLIANCE ALERT [${row.severity}]: ${row.alertMessage} | Client: ${c} | Status: ${row.status} | Type: ${row.alertType ?? "N/A"} | Date: ${row.createdAt ? new Date(row.createdAt).toISOString().split("T")[0] : "N/A"}`;
    }

    case "recommendations": {
      const c = row.client ? `${row.client.firstName} ${row.client.lastName}` : "Unknown";
      return `RECOMMENDATION [${row.recommendationType}] → ${c}: ${row.recommendationText} | Confidence: ${row.confidenceScore ? (row.confidenceScore * 100).toFixed(0) + "%" : "N/A"} | Reasoning: ${row.reasoning}`;
    }

    case "market_data": {
      const chg = row.dailyChange >= 0 ? `+${row.dailyChange}%` : `${row.dailyChange}%`;
      return `MARKET: ${row.symbol} (${row.assetType}) | Price: $${row.currentPrice} | Change: ${chg} | Volume: ${row.volume?.toLocaleString()} | 52W High: $${row.week52High} | 52W Low: $${row.week52Low} | P/E: ${row.peRatio ?? "N/A"} | Sector: ${row.sector}`;
    }

    case "research_reports":
      return `RESEARCH: "${row.title}" [${row.category}] — ${(row.content || "").slice(0, 400)}`;

    default:
      return JSON.stringify(row);
  }
}

async function fetchAggregatedStats() {
  try {
    const [totalClients, totalPortfolios, totalTransactions, portfolios, openAlerts, holdings] =
      await Promise.all([
        prisma.client.count(),
        prisma.portfolio.count(),
        prisma.transaction.count(),
        prisma.portfolio.findMany({ select: { totalValue: true, riskScore: true, performanceScore: true } }),
        prisma.complianceAlert.count({ where: { status: { not: "resolved" } } }),
        prisma.holding.findMany({ select: { symbol: true, allocationPercentage: true, currentPrice: true, purchasePrice: true } }),
      ]);

    const totalAUM  = portfolios.reduce((s, p) => s + (p.totalValue || 0), 0);
    const avgRisk   = portfolios.length ? portfolios.reduce((s, p) => s + (p.riskScore || 0), 0) / portfolios.length : 0;
    const avgPerf   = portfolios.length ? portfolios.reduce((s, p) => s + (p.performanceScore || 0), 0) / portfolios.length : 0;
    const concentrationRisks = holdings
      .filter(h => (h.allocationPercentage || 0) > 20)
      .sort((a, b) => b.allocationPercentage - a.allocationPercentage)
      .slice(0, 5)
      .map(h => `${h.symbol} at ${h.allocationPercentage?.toFixed(1)}%`);

    return { totalClients, totalPortfolios, totalTransactions, totalAUM: totalAUM.toFixed(2), avgRiskScore: avgRisk.toFixed(2), avgPerformanceScore: avgPerf.toFixed(2), openComplianceAlerts: openAlerts, concentrationRisks };
  } catch (err) {
    console.warn("[retriever] fetchAggregatedStats failed:", err.message);
    return null;
  }
}

async function retrieveContext(tables, query) {
  const parts = [];
  const results = await Promise.all(tables.map(t => fetchRecords(t, query)));

  for (let i = 0; i < tables.length; i++) {
    const records = results[i];
    if (!records?.length) continue;
    const formatted = records.map(r => formatRecord(tables[i], r)).filter(Boolean).join("\n");
    if (formatted) parts.push(`=== ${tables[i].toUpperCase().replace(/_/g, " ")} ===\n${formatted}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

module.exports = { retrieveContext, fetchAggregatedStats };
