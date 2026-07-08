const mongoose = require("mongoose");
const Anthropic = require("@anthropic-ai/sdk");

const checkMongo = () => mongoose.connection.readyState === 1;

// The AI canary is a real 1-token messages.create — key-presence checks
// can't catch the failure mode that actually happened in production (a
// valid key with an empty credit balance, which 400s only on message
// calls). Cached so an uptime monitor pinging every minute still only
// spends ~one canary per 10 minutes (fractions of a cent per day).
const AI_CHECK_TTL_MS = 10 * 60 * 1000;
let lastAiCheck = { ok: null, checked_at: null, error: null };

const checkAi = async () => {
  const now = Date.now();
  if (lastAiCheck.checked_at && now - lastAiCheck.checked_at < AI_CHECK_TTL_MS) {
    return lastAiCheck;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    lastAiCheck = { ok: false, checked_at: now, error: "ANTHROPIC_API_KEY is not set" };
    return lastAiCheck;
  }
  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 10000,
      maxRetries: 0,
    });
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    lastAiCheck = { ok: true, checked_at: now, error: null };
  } catch (err) {
    lastAiCheck = {
      ok: false,
      checked_at: now,
      error: (err.message || "unknown error").slice(0, 200),
    };
  }
  return lastAiCheck;
};

// Test hook — lets health-route tests control the canary without real
// network calls.
const _setAiCheckForTests = (value) => {
  lastAiCheck = value;
};

module.exports = { checkMongo, checkAi, _setAiCheckForTests };
