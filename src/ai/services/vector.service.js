/**
 * Vector Search Service — Supabase pgvector
 * Section 7: Knowledge Layer — semantic similarity search
 *
 * Uses Gemini's text-embedding-004 model to embed queries,
 * then finds the most semantically similar records in Supabase
 * using pgvector cosine similarity.
 *
 * Setup SQL (run once in Supabase SQL Editor):
 *
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *
 *   CREATE TABLE IF NOT EXISTS document_embeddings (
 *     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     table_name   text NOT NULL,
 *     record_id    uuid NOT NULL,
 *     content      text NOT NULL,
 *     embedding    vector(768),
 *     created_at   timestamp DEFAULT now()
 *   );
 *
 *   CREATE INDEX IF NOT EXISTS idx_embeddings_table
 *     ON document_embeddings (table_name);
 *
 *   CREATE OR REPLACE FUNCTION match_documents(
 *     query_embedding vector(768),
 *     match_table     text,
 *     match_count     int DEFAULT 10,
 *     match_threshold float DEFAULT 0.5
 *   ) RETURNS TABLE (
 *     id uuid, table_name text, record_id uuid, content text, similarity float
 *   ) LANGUAGE sql STABLE AS $$
 *     SELECT id, table_name, record_id, content,
 *            1 - (embedding <=> query_embedding) AS similarity
 *     FROM   document_embeddings
 *     WHERE  table_name = match_table
 *       AND  1 - (embedding <=> query_embedding) > match_threshold
 *     ORDER  BY embedding <=> query_embedding
 *     LIMIT  match_count;
 *   $$;
 */

const axios  = require("axios");
const prisma = require("../../prisma/prisma");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL    = "text-embedding-004";
const EMBED_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

// ─── Embed a text string with Gemini ─────────────────────────────────────────

async function embedText(text) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const clean = String(text || "").slice(0, 2000);
  const res = await axios.post(
    `${EMBED_URL}?key=${GEMINI_API_KEY}`,
    { model: `models/${EMBED_MODEL}`, content: { parts: [{ text: clean }] } },
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );
  return res.data?.embedding?.values || null;
}

// ─── Serialize a DB record to a searchable text string ───────────────────────

function serializeRecord(table, row) {
  switch (table) {
    case "clients":
      return `Client ${row.firstName} ${row.lastName}. Risk: ${row.riskProfile}. Goal: ${row.investmentGoal}. Income: $${row.annualIncome}. Net worth: $${row.netWorth}. City: ${row.city}. Age: ${row.age}.`;
    case "portfolios":
      return `Portfolio "${row.portfolioName}". Value: $${row.totalValue}. Risk score: ${row.riskScore}/10. Performance: ${row.performanceScore}%. Type: ${row.portfolioType}. Benchmark: ${row.benchmark}.`;
    case "holdings":
      return `Holding ${row.symbol} (${row.assetType}). Quantity: ${row.quantity}. Buy price: $${row.purchasePrice}. Current: $${row.currentPrice}. Allocation: ${row.allocationPercentage}%. Sector: ${row.sector}.`;
    case "compliance_alerts":
      return `Compliance alert severity ${row.severity}: ${row.alertMessage}. Status: ${row.status}. Type: ${row.alertType}.`;
    case "recommendations":
      return `Recommendation type ${row.recommendationType}: ${row.recommendationText}. Reasoning: ${row.reasoning}. Confidence: ${row.confidenceScore}.`;
    case "market_data":
      return `Market ${row.symbol} (${row.assetType}). Price: $${row.currentPrice}. Daily change: ${row.dailyChange}%. Sector: ${row.sector}.`;
    case "research_reports":
      return `Research report "${row.title}" category ${row.category}. ${(row.content || "").slice(0, 300)}.`;
    default:
      return JSON.stringify(row).slice(0, 500);
  }
}

// ─── Fetch all records for embedding ─────────────────────────────────────────

async function fetchRecordsForEmbedding(table) {
  switch (table) {
    case "clients":      return prisma.client.findMany({ take: 100 });
    case "portfolios":   return prisma.portfolio.findMany({ take: 100 });
    case "holdings":     return prisma.holding.findMany({ take: 200, orderBy: { allocationPercentage: "desc" } });
    case "compliance_alerts": return prisma.complianceAlert.findMany({ take: 100 });
    case "recommendations":   return prisma.recommendation.findMany({ take: 100 });
    case "market_data":       return prisma.marketData.findMany({ take: 50 });
    case "research_reports":  return prisma.researchReport.findMany({ take: 50 });
    default: return [];
  }
}

// ─── Get Supabase client ──────────────────────────────────────────────────────

function getSupabase() {
  try {
    const { createClient } = require("@supabase/supabase-js");
    return createClient(
      process.env.SUPABASE_URL || "https://yigrmierugfllnxtznjd.supabase.co",
      process.env.SUPABASE_KEY || ""
    );
  } catch { return null; }
}

// ─── Index a table (generate & store embeddings) ─────────────────────────────

async function indexTable(table) {
  const supabase = getSupabase();
  if (!supabase) return { indexed: 0, error: "Supabase not configured" };

  const records = await fetchRecordsForEmbedding(table);
  let indexed = 0;

  for (const row of records) {
    try {
      const content   = serializeRecord(table, row);
      const embedding = await embedText(content);
      if (!embedding) continue;

      await supabase.from("document_embeddings").upsert({
        table_name: table,
        record_id:  row.id,
        content,
        embedding,
      }, { onConflict: "table_name,record_id" });

      indexed++;
      await new Promise(r => setTimeout(r, 100)); // rate limit
    } catch (e) {
      console.warn(`[vector] Failed to embed ${table} ${row.id}:`, e.message);
    }
  }
  return { indexed };
}

// ─── Semantic search ─────────────────────────────────────────────────────────

async function semanticSearch(query, tables, topK = 8) {
  const supabase = getSupabase();
  if (!supabase || !GEMINI_API_KEY) return [];

  try {
    const queryEmbedding = await embedText(query);
    if (!queryEmbedding) return [];

    const results = [];
    await Promise.all(tables.map(async (table) => {
      try {
        const { data, error } = await supabase.rpc("match_documents", {
          query_embedding: queryEmbedding,
          match_table:     table,
          match_count:     topK,
          match_threshold: 0.5,
        });
        if (error || !data) return;
        results.push(...data.map(d => ({ ...d, table })));
      } catch {}
    }));

    return results
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, topK * 2);
  } catch (e) {
    console.warn("[vector] semanticSearch failed:", e.message);
    return [];
  }
}

// ─── Format results as context ───────────────────────────────────────────────

function formatVectorContext(results) {
  if (!results?.length) return null;
  const byTable = {};
  for (const r of results) {
    if (!byTable[r.table_name || r.table]) byTable[r.table_name || r.table] = [];
    byTable[r.table_name || r.table].push(r.content);
  }
  return Object.entries(byTable)
    .map(([t, texts]) => `=== ${t.toUpperCase().replace(/_/g, " ")} (semantic match) ===\n${texts.join("\n")}`)
    .join("\n\n");
}

module.exports = { semanticSearch, indexTable, embedText, formatVectorContext, serializeRecord };
