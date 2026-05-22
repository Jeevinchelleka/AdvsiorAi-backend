/**
 * RAG Retriever Service
 *
 * Fetches relevant records from Supabase based on intent + query.
 * Implements smart retrieval:
 *  - Keyword search on relevant columns
 *  - Fallback to recent records if no keyword match
 *  - Aggregated stats for portfolio/compliance summaries
 */

const prisma = require("../../prisma/prisma");

// How many records to fetch per table
const RECORD_LIMIT = 8;

/**
 * Fetch records from a table using Prisma with optional keyword filter.
 */
async function fetchRecords(table, query) {
  const q = (query || "").trim().toLowerCase();

  try {
    switch (table) {
      case "clients": {
        const where = q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName:  { contains: q, mode: "insensitive" } },
                { email:     { contains: q, mode: "insensitive" } },
                { riskProfile:    { contains: q, mode: "insensitive" } },
                { investmentGoal: { contains: q, mode: "insensitive" } },
              ],
            }
          : {};
        return await prisma.client.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: RECORD_LIMIT,
        });
      }

      case "portfolios": {
        const where = q
          ? { portfolioName: { contains: q, mode: "insensitive" } }
          : {};
        return await prisma.portfolio.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: RECORD_LIMIT,
          include: { client: { select: { firstName: true, lastName: true } } },
        });
      }

      case "holdings": {
        const where = q
          ? {
              OR: [
                { symbol:    { contains: q, mode: "insensitive" } },
                { assetType: { contains: q, mode: "insensitive" } },
              ],
            }
          : {};
        return await prisma.holding.findMany({
          where,
          orderBy: { allocationPercentage: "desc" },
          take: RECORD_LIMIT,
        });
      }

      case "transactions": {
        const where = q
          ? {
              OR: [
                { symbol:          { contains: q, mode: "insensitive" } },
                { transactionType: { contains: q, mode: "insensitive" } },
                { status:          { contains: q, mode: "insensitive" } },
              ],
            }
          : {};
        return await prisma.transaction.findMany({
          where,
          orderBy: { tradeDate: "desc" },
          take: RECORD_LIMIT,
        });
      }

      case "compliance_alerts": {
        const where = q
          ? {
              OR: [
                { alertMessage: { contains: q, mode: "insensitive" } },
                { severity:     { contains: q, mode: "insensitive" } },
                { status:       { contains: q, mode: "insensitive" } },
              ],
            }
          : {};
        return await prisma.complianceAlert.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: RECORD_LIMIT,
          include: { client: { select: { firstName: true, lastName: true, riskProfile: true } } },
        });
      }

      case "recommendations": {
        const where = q
          ? {
              OR: [
                { recommendationType: { contains: q, mode: "insensitive" } },
                { recommendationText: { contains: q, mode: "insensitive" } },
              ],
            }
          : {};
        return await prisma.recommendation.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: RECORD_LIMIT,
          include: { client: { select: { firstName: true, lastName: true } } },
        });
      }

      case "market_data": {
        const where = q
          ? { symbol: { contains: q, mode: "insensitive" } }
          : {};
        return await prisma.marketData.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: RECORD_LIMIT,
        });
      }

      case "research_reports": {
        const where = q
          ? {
              OR: [
                { title:    { contains: q, mode: "insensitive" } },
                { category: { contains: q, mode: "insensitive" } },
                { content:  { contains: q, mode: "insensitive" } },
              ],
            }
          : {};
        return await prisma.researchReport.findMany({
          where,
          orderBy: { uploadedAt: "desc" },
          take: RECORD_LIMIT,
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

/**
 * Fetch aggregated stats for advisor productivity summaries
 */
async function fetchAggregatedStats() {
  try {
    const [
      totalClients, totalPortfolios, totalTransactions,
      portfolios, openAlerts, holdings,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.portfolio.count(),
      prisma.transaction.count(),
      prisma.portfolio.findMany({ select: { totalValue: true, riskScore: true, performanceScore: true } }),
      prisma.complianceAlert.count({ where: { status: { not: "resolved" } } }),
      prisma.holding.findMany({ select: { symbol: true, allocationPercentage: true, currentPrice: true, purchasePrice: true } }),
    ]);

    const totalAUM = portfolios.reduce((s, p) => s + (p.totalValue || 0), 0);
    const avgRisk  = portfolios.length ? portfolios.reduce((s, p) => s + (p.riskScore || 0), 0) / portfolios.length : 0;
    const avgPerf  = portfolios.length ? portfolios.reduce((s, p) => s + (p.performanceScore || 0), 0) / portfolios.length : 0;

    // Top concentration risks
    const concentrationRisks = holdings
      .filter(h => (h.allocationPercentage || 0) > 20)
      .sort((a, b) => b.allocationPercentage - a.allocationPercentage)
      .slice(0, 5)
      .map(h => `${h.symbol} at ${h.allocationPercentage?.toFixed(1)}%`);

    return {
      totalClients, totalPortfolios, totalTransactions,
      totalAUM: totalAUM.toFixed(2),
      avgRiskScore: avgRisk.toFixed(2),
      avgPerformanceScore: avgPerf.toFixed(2),
      openComplianceAlerts: openAlerts,
      concentrationRisks,
    };
  } catch (err) {
    console.warn("[retriever] Failed to fetch aggregated stats:", err.message);
    return null;
  }
}

/**
 * Format a record from a given table into a human-readable string for the LLM context.
 */
function formatRecord(table, row) {
  if (!row) return "";

  switch (table) {
    case "clients":
      return `CLIENT: ${row.firstName || ""} ${row.lastName || ""} | Email: ${row.email || "N/A"} | Phone: ${row.phone || "N/A"} | Risk Profile: ${row.riskProfile || "N/A"} | Annual Income: $${row.annualIncome ?? "N/A"} | Net Worth: $${row.netWorth ?? "N/A"} | Investment Goal: ${row.investmentGoal || "N/A"}`;

    case "portfolios":
      return `PORTFOLIO: "${row.portfolioName || "Unnamed"}" | Client: ${row.client ? `${row.client.firstName} ${row.client.lastName}` : row.clientId} | Total Value: $${row.totalValue ?? "N/A"} | Risk Score: ${row.riskScore ?? "N/A"}/10 | Performance Score: ${row.performanceScore ?? "N/A"}%`;

    case "holdings":
      const pnl = row.purchasePrice > 0 ? (((row.currentPrice - row.purchasePrice) / row.purchasePrice) * 100).toFixed(1) : "N/A";
      return `HOLDING: ${row.symbol || "N/A"} (${row.assetType || "N/A"}) | Qty: ${row.quantity ?? "N/A"} | Purchase: $${row.purchasePrice ?? "N/A"} | Current: $${row.currentPrice ?? "N/A"} | P&L: ${pnl}% | Allocation: ${row.allocationPercentage ?? "N/A"}%`;

    case "transactions":
      return `TRANSACTION: ${row.transactionType || "N/A"} ${row.symbol || "N/A"} | Qty: ${row.quantity ?? "N/A"} @ $${row.price ?? "N/A"} | Date: ${row.tradeDate ? new Date(row.tradeDate).toISOString().split("T")[0] : "N/A"} | Status: ${row.status || "N/A"}`;

    case "compliance_alerts":
      const clientName = row.client ? `${row.client.firstName} ${row.client.lastName}` : "Unknown";
      return `COMPLIANCE ALERT [${row.severity || "N/A"}]: ${row.alertMessage || "N/A"} | Client: ${clientName} | Status: ${row.status || "N/A"} | Date: ${row.createdAt ? new Date(row.createdAt).toISOString().split("T")[0] : "N/A"}`;

    case "recommendations":
      const recClient = row.client ? `${row.client.firstName} ${row.client.lastName}` : "Unknown";
      return `RECOMMENDATION [${row.recommendationType || "N/A"}] for ${recClient}: ${row.recommendationText || "N/A"} | Confidence: ${row.confidenceScore ? (row.confidenceScore * 100).toFixed(0) + "%" : "N/A"} | Reasoning: ${row.reasoning || "N/A"}`;

    case "market_data":
      const change = row.dailyChange >= 0 ? `+${row.dailyChange}%` : `${row.dailyChange}%`;
      return `MARKET: ${row.symbol || "N/A"} | Price: $${row.currentPrice ?? "N/A"} | Daily Change: ${change} | Volume: ${row.volume?.toLocaleString() ?? "N/A"}`;

    case "research_reports":
      return `RESEARCH REPORT: "${row.title || "Untitled"}" [${row.category || "N/A"}] | ${(row.content || "").slice(0, 300)}`;

    default:
      return JSON.stringify(row);
  }
}

/**
 * Main retrieval function — fetches context for given tables and query.
 */
async function retrieveContext(tables, query, includeStats = false) {
  const contextParts = [];

  // Optionally include aggregated stats
  if (includeStats) {
    const stats = await fetchAggregatedStats();
    if (stats) {
      contextParts.push(
        `=== ADVISOR BOOK SUMMARY ===\n` +
        `Total Clients: ${stats.totalClients}\n` +
        `Total Portfolios: ${stats.totalPortfolios}\n` +
        `Total Transactions: ${stats.totalTransactions}\n` +
        `Total AUM: $${stats.totalAUM}\n` +
        `Average Risk Score: ${stats.avgRiskScore}/10\n` +
        `Average Performance Score: ${stats.avgPerformanceScore}%\n` +
        `Open Compliance Alerts: ${stats.openComplianceAlerts}\n` +
        `Concentration Risks (>20%): ${stats.concentrationRisks.length > 0 ? stats.concentrationRisks.join(", ") : "None"}`
      );
    }
  }

  // Fetch records from each relevant table in parallel
  const results = await Promise.all(tables.map(t => fetchRecords(t, query)));

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const records = results[i];
    if (!records || records.length === 0) continue;

    const formatted = records
      .map(r => formatRecord(table, r))
      .filter(Boolean)
      .join("\n");

    if (formatted) {
      contextParts.push(`=== ${table.toUpperCase().replace("_", " ")} ===\n${formatted}`);
    }
  }

  return contextParts.length > 0
    ? contextParts.join("\n\n")
    : "No relevant data found in the database for this query.";
}

module.exports = { retrieveContext, fetchAggregatedStats };
