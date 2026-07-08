const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const { _setAiCheckForTests } = require("../../services/healthService");

beforeAll(async () => {
  await connectTestDB();
});

describe("GET /health (Railway deploy gate)", () => {
  it("reports ok with Mongo connected, without touching the AI provider", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.mongo).toBe("ok");
    expect(res.body.ai).toBeUndefined();
  });
});

describe("GET /health/deep (uptime monitor)", () => {
  it("returns 200 when Mongo and the AI canary are both healthy", async () => {
    // Fresh cached result inside the TTL — checkAi serves it without a
    // real network call.
    _setAiCheckForTests({ ok: true, checked_at: Date.now(), error: null });

    const res = await request(app).get("/health/deep");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.ai.ok).toBe(true);
  });

  it("returns 503 when the AI canary is failing (e.g. empty credit balance)", async () => {
    _setAiCheckForTests({
      ok: false,
      checked_at: Date.now(),
      error: "Your credit balance is too low to access the Anthropic API.",
    });

    const res = await request(app).get("/health/deep");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.mongo).toBe("ok");
    expect(res.body.ai.error).toContain("credit balance");
  });
});
