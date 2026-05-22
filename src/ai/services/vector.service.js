/**
 * Lightweight Vector Store using Gemini Embeddings
 *
 * Since we don't have a dedicated vector DB, we:
 * 1. Fetch ALL records from Supabase at query time (small dataset ~10 rows/table)
 * 2. Embed each record + the query using Gemini's embedding API
 * 3. Rank by cosine similarity
 * 4. Return top-K most relevant records
 *
 * This gives true semantic search without needing pgvector or Pinecone.
 */

const axios = require("axios");
const prisma = require("../../prisma/prisma");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// gemini-embedding-2 is the latest Gemini embedding model
const EMBED_MODEL = "gemini-embedding-2";
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

// ─── Embedding ────────────────────────────────────────────────────────────────

async function getEmbedding(text) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const clean = String(text || "").slice(0, 2000); // API limit
  const res = await axios.post(
    `${EMBED_URL}?key=${GEMINI_API_KEY}`,
    { model: `models/${EMBED_MODEL}`, content: { parts: [{ text: clean }] } },
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );
  return res.data?.embedding?.values || [];
}

async function getBatchEmbeddings(texts) {
  // Gemini doesn't have a true batch embed endpoint on free tier,
  // so we run them in parallel with a small concurrency limit
  const BATCH = 5;
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const embeddings = await Promise.all(slice.map(t => getEmbedding(t).catch(() => [])));
    results.push(...embeddings);
  }
  return results;
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Record Serializers ───────────────────────────────────────────────────────

function serializeRecord(table, row) {
  switch (table) {
    case "clients":
      return `Client ${row.firstName} ${row.lastName}. Risk profile: ${row.riskProfile}. Annual income: $${row.annualIncome}. Net worth: $${row.netWorth}. Investment goal: ${row.investmentGoal}. Email: ${row.email}.`;
    case "portfolios":
      return `Portfolio "${row.portfolioName}" for client ${row.client ? row.client.firstName + " " + row.client.lastName : row.clientId}. Total value: $${row.totalValue}. Risk score: ${row.riskScore}/10. Performance score: ${row.performanceScore}%.`;
    case "holdings":
      const pnl = row.purchasePrice > 0 ? (((row.currentPrice - row.purchasePrice) / row.purchasePrice) * 100).toFixed(1) : "N/A";
      return `Holding ${row.symbol} (${row.assetType}). Quantity: ${row.quantity}. Purchase price: $${row.purchasePrice}. Current price: $${row.currentPrice}. P&L: ${pnl}%. Allocation: ${row.allocationPercentage}%.`;
    case "transactions":
      return `Transaction: ${row.transactionType} ${row.symbol}. Quantity: ${row.quantity} at $${row.price}. Date: ${row.tradeDate ? new Date(row.tradeDate).toISOString().split("T")[0] : "N/A"}. Status: ${row.status}.`;
    case "compliance_alerts":
      return `Compliance alert (${row.severity}): ${row.alertMessage}. Client: ${row.client ? row.client.firstName + " " + row.client.lastName : "Unknown"}. Status: ${row.status}.`;
    case "recommendations":
      return `Recommendation (${row.recommendationType}) for ${row.client ? row.client.firstName + " " + row.client.lastName : "Unknown"}: ${row.recommendationText}. Confidence: ${row.confidenceScore ? (row.confidenceScore * 100).toFixed(0) + "%" : "N/A"}. Reasoning: ${row.reasoning}.`;
    case "market_data":
      return `Market data: ${row.symbol}. Price: $${row.currentPrice}. Daily change: ${row.dailyChange}%. Volume: ${row.volume}.`;
    case "research_reports":
      return `Research report: "${row.title}" (${row.category}). ${(row.content || "").slice(0, 400)}.`;
    default:
      return JSON.stringify(row);
  }
}

// ─── Fetch All Records ────────────────────────────────────────────────────────

async function fetchAllRecords(tables) {
  const fetchers = {
    clients:           () => prisma.client.findMany({ take: 20 }),
    portfolios:        () => prisma.portfolio.findMany({ take: 20, include: { client: { select: { firstName: true, lastName: true } } } }),
    holdings:          () => prisma.holding.findMany({ take: 30, orderBy: { allocationPercentage: "desc" } }),
    transactions:      () => prisma.transaction.findMany({ take: 30, orderBy: { tradeDate: "desc" } }),
    compliance_alerts: () => prisma.complianceAlert.findMany({ take: 20, include: { client: { select: { firstName: true, lastName: true } } } }),
    recommendations:   () => prisma.recommendation.findMany({ take: 20, include: { client: { select: { firstName: true, lastName: true } } } }),
    market_data:       () => prisma.marketData.findMany({ take: 20 }),
    research_reports:  () => prisma.researchReport.findMany({ take: 20 }),
  };

  const docs = [];
  await Promise.all(
    tables.map(async (table) => {
      try {
        const rows = await (fetchers[table] || (() => Promise.resolve([])))();
        for (const row of rows) {
          docs.push({ table, row, text: serializeRecord(table, row) });
        }
      } catch (e) {
        console.warn(`[vector] Failed to fetch ${table}:`, e.message);
      }
    })
  );
  return docs;
}

// ─── Main Semantic Search ─────────────────────────────────────────────────────

/**
 * Semantically retrieve the top-K most relevant records for a query.
 * Falls back to keyword retrieval if embedding fails.
 */
async function semanticRetrieve(query, tables, topK = 12) {
  const docs = await fetchAllRecords(tables);
  if (docs.length === 0) return [];

  try {
    // Embed query + all docs in parallel
    const [queryEmbed, ...docEmbeds] = await Promise.all([
      getEmbedding(query),
      ...docs.map(d => getEmbedding(d.text).catch(() => [])),
    ]);

    // Score each doc
    const scored = docs.map((doc, i) => ({
      ...doc,
      score: cosineSimilarity(queryEmbed, docEmbeds[i]),
    }));

    // Sort by score descending, take top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);

  } catch (e) {
    console.warn("[vector] Embedding failed, falling back to all docs:", e.message);
    // Fallback: return first topK docs without scoring
    return docs.slice(0, topK).map(d => ({ ...d, score: 0 }));
  }
}

// ─── Format Retrieved Docs for LLM Context ───────────────────────────────────

function formatDocsAsContext(docs) {
  if (!docs.length) return "No relevant data found.";

  // Group by table for cleaner context
  const byTable = {};
  for (const doc of docs) {
    if (!byTable[doc.table]) byTable[doc.table] = [];
    byTable[doc.table].push(doc.text);
  }

  return Object.entries(byTable)
    .map(([table, texts]) =>
      `=== ${table.toUpperCase().replace(/_/g, " ")} ===\n${texts.join("\n")}`
    )
    .join("\n\n");
}

module.exports = { semanticRetrieve, formatDocsAsContext, fetchAllRecords, serializeRecord };
