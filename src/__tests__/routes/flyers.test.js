jest.mock("../../services/flyerService", () => ({
  generateFlyer: jest.fn().mockResolvedValue({
    png: Buffer.from("fake-flyer-png"),
    meta: { layout: "monument", tone: "formal", background_id: "bg1" },
  }),
}));

jest.mock("../../services/storageService", () => ({
  uploadFile: jest.fn().mockResolvedValue({
    key: "ktm-test/flyers/f-abc.png",
    url: "https://pub-test.r2.dev/ktm-test/flyers/f-abc.png",
  }),
  deleteFile: jest.fn().mockResolvedValue({ deleted: true }),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Flyer = require("../../models/Flyer");
const Person = require("../../models/Person");
const User = require("../../models/User");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "KTM Test",
  plan: "enterprise",
  branding: { colors: { primary: "#03293F" } },
};

let adminToken, teamToken;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});
afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Flyer.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["flyer-admin@ktm.com", "flyer-team@ktm.com"] },
  });
  await mongoose.connection.close(true);
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Flyer.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["flyer-admin@ktm.com", "flyer-team@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const a = await request(app)
    .post("/api/auth/register")
    .send({
      email: "flyer-admin@ktm.com",
      password: "Password123",
      name: "A",
      ministry_id: "ktm-test",
      role: "admin",
    });
  adminToken = a.body.token;
  const t = await request(app)
    .post("/api/auth/register")
    .send({
      email: "flyer-team@ktm.com",
      password: "Password123",
      name: "T",
      ministry_id: "ktm-test",
      role: "team",
    });
  teamToken = t.body.token;
});

describe("GET /api/flyers/layouts", () => {
  it("returns the layout gallery", async () => {
    const res = await request(app)
      .get("/api/flyers/layouts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body[0]).toHaveProperty("name");
  });
});

describe("POST /api/flyers/generate", () => {
  it("generates and saves a flyer", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prophetic Training Workshop",
        date: "June 12-14",
        qr_url: "https://x.com",
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Prophetic Training Workshop");
    expect(res.body.social_url).toContain("r2.dev");
    expect(res.body.print_url).toContain("r2.dev");
    expect(res.body.layout).toBe("monument");
  });

  it("rejects generation by a team member", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ title: "Should fail" });
    expect(res.status).toBe(403);
  });

  it("rejects a flyer with no title", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "June 12" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/flyers", () => {
  it("returns flyer history", async () => {
    await Flyer.create({
      ministry_id: "ktm-test",
      title: "F1",
      layout: "monument",
    });
    const res = await request(app)
      .get("/api/flyers")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
