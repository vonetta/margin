jest.mock("../../services/imageService", () => ({
  generateBackground: jest
    .fn()
    .mockResolvedValue(Buffer.from("fake-png-bytes")),
  MODEL_ID: "gemini-2.5-flash-image",
}));

jest.mock("../../services/storageService", () => ({
  uploadFile: jest.fn().mockResolvedValue({
    key: "ktm-test/backgrounds/bg-abc123.png",
    url: "https://pub-test.r2.dev/ktm-test/backgrounds/bg-abc123.png",
  }),
  deleteFile: jest.fn().mockResolvedValue({ deleted: true }),
  safeDeleteFile: jest.fn().mockResolvedValue({ deleted: true }),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Background = require("../../models/Background");
const User = require("../../models/User");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "KTM Test",
  plan: "enterprise",
};

let adminToken;
let teamToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Background.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["bg-admin@ktm.com", "bg-team@ktm.com"] },
  });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Background.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["bg-admin@ktm.com", "bg-team@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const adminRes = await request(app).post("/api/auth/register").send({
    email: "bg-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = adminRes.body.token;

  const teamRes = await request(app).post("/api/auth/register").send({
    email: "bg-team@ktm.com",
    password: "Password123",
    name: "Team",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = teamRes.body.token;
});

describe("POST /api/backgrounds/generate", () => {
  it("generates and stores a background as admin", async () => {
    const res = await request(app)
      .post("/api/backgrounds/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ prompt: "Deep navy and gold cosmic background", tone: "formal" });

    expect(res.status).toBe(201);
    expect(res.body.url).toContain("r2.dev");
    expect(res.body.prompt).toBe("Deep navy and gold cosmic background");
    expect(res.body.tone).toBe("formal");
  });

  it("rejects generation by a team member", async () => {
    const res = await request(app)
      .post("/api/backgrounds/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ prompt: "Should fail" });

    expect(res.status).toBe(403);
  });

  it("rejects an empty prompt", async () => {
    const res = await request(app)
      .post("/api/backgrounds/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ prompt: "" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/backgrounds", () => {
  it("returns the ministry's background library", async () => {
    await Background.create({
      ministry_id: "ktm-test",
      prompt: "p1",
      url: "u1",
      key: "k1",
    });
    await Background.create({
      ministry_id: "ktm-test",
      prompt: "p2",
      url: "u2",
      key: "k2",
    });

    const res = await request(app)
      .get("/api/backgrounds")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it("does not return another ministry's backgrounds", async () => {
    await Background.create({
      ministry_id: "other",
      prompt: "p",
      url: "u",
      key: "k",
    });

    const res = await request(app)
      .get("/api/backgrounds")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.length).toBe(0);
  });
});

describe("DELETE /api/backgrounds/:id", () => {
  it("deletes a background", async () => {
    const bg = await Background.create({
      ministry_id: "ktm-test",
      prompt: "p",
      url: "u",
      key: "k",
    });

    const res = await request(app)
      .delete(`/api/backgrounds/${bg._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
});
