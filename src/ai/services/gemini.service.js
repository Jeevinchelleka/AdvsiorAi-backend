/**
 * Gemini AI service — uses Google Generative Language REST API
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
 */

const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// gemini-1.5-flash is free-tier friendly and fast
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

/**
 * Send a message to Gemini and get a plain text response.
 *
 * @param {string} message - The user's message
 * @param {Array}  history - Prior messages [{role, content}]
 * @returns {Promise<string>} - The AI text response
 */
async function askGemini(message, history = []) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the backend .env file.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // Build conversation turns for multi-turn chat
  // Gemini uses "user" and "model" roles (not "assistant")
  const contents = [];

  for (const msg of history) {
    if (!msg.content?.trim()) continue;
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  // Add the current user message
  contents.push({
    role: "user",
    parts: [{ text: message }],
  });

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      topP: 0.9,
    },
    systemInstruction: {
      parts: [
        {
          text: "You are AdvisorAI, a helpful and knowledgeable financial advisor assistant. Answer questions clearly and concisely. You can discuss financial topics, investment strategies, portfolio management, market trends, and general financial advice.",
        },
      ],
    },
  };

  const response = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });

  const candidate = response.data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    const reason = candidate?.finishReason;
    if (reason === "SAFETY") {
      return "I'm not able to respond to that request due to safety guidelines.";
    }
    throw new Error("Gemini returned an empty response.");
  }

  return text.trim();
}

module.exports = { askGemini };
