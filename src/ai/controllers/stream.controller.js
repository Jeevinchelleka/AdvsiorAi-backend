/**
 * Streaming AI Controller — Server-Sent Events (SSE)
 * Section 7: AI Orchestration Layer — streaming responses
 *
 * Uses Gemini's streamGenerateContent API to push tokens to the client
 * as they arrive, giving a real-time typewriter effect.
 */

const axios = require("axios");
const { classifyIntent, getTablesForIntent } = require("../services/intent.service");
const { retrieveContext, fetchAggregatedStats } = require("../services/retriever.service");

const INTENTS_NEEDING_STATS = ["ADVISOR_PRODUCTIVITY", "PORTFOLIO_INSIGHTS", "COMPLIANCE", "GENERAL"];

const BASE_SYSTEM = `You are AdvisorAI — an intelligent financial advisor concierge.
You have LIVE access to the firm's database. Use ONLY the DATABASE CONTEXT provided.
List ALL items when asked. Use exact numbers. Format currency as $1,234 and percentages as 12.3%.`;

async function streamChat(req, res) {
  const { message, conversationId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message required." });

  // SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering on Railway
  res.flushHeaders();

  const write = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Classify intent
    const { intent } = classifyIntent(message);
    write("intent", { intent });

    // 2. Retrieve context from DB
    const tables = getTablesForIntent(intent);
    write("tables", { tables });

    const [context, stats] = await Promise.all([
      retrieveContext(tables, message),
      INTENTS_NEEDING_STATS.includes(intent) ? fetchAggregatedStats() : null,
    ]);

    let contextText = "";
    if (stats) {
      contextText += `=== LIVE BOOK SUMMARY ===\nTotal Clients: ${stats.totalClients} | Total AUM: $${stats.totalAUM} | Avg Risk: ${stats.avgRiskScore}/10 | Open Alerts: ${stats.openComplianceAlerts}\n\n`;
    }
    if (context) contextText += context;

    // 3. Build Gemini streaming request
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;

    const userText = contextText
      ? `DATABASE CONTEXT:\n${contextText}\n\n---\nQUESTION: ${message}`
      : message;

    const body = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: BASE_SYSTEM }] },
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, topP: 0.8 },
    };

    // 4. Stream from Gemini → SSE to client
    const geminiRes = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      responseType: "stream",
      timeout: 120_000,
    });

    let fullText = "";
    let buffer   = "";

    geminiRes.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const parsed = JSON.parse(raw);
          const token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (token) {
            fullText += token;
            write("token", { token });
          }
        } catch {}
      }
    });

    geminiRes.data.on("end", () => {
      write("done", { fullText, intent, tables });
      res.end();
    });

    geminiRes.data.on("error", (err) => {
      write("error", { message: err.message });
      res.end();
    });

  } catch (err) {
    const detail = err?.response?.data?.error?.message || err.message;
    write("error", { message: detail });
    res.end();
  }
}

module.exports = { streamChat };
