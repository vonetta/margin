const request = require("supertest");
const app = require("../../app");
const mongoose = require("mongoose");
const Ministry = require("../../models/Ministry");

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.connection.close(true);
});

afterEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-tenant-test" });
});

describe("Tenant middleware", () => {
  it("returns 400 if no ministry ID header is provided", async () => {
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No ministry ID provided");
  });

  it("returns 404 if ministry ID does not exist", async () => {
    const res = await request(app)
      .get("/api/test")
      .set("x-ministry-id", "nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Ministry not found");
  });

  it("passes through when a valid ministry ID is provided", async () => {
    await Ministry.create({
      ministry_id: "ktm-tenant-test",
      name: "Khy Traylor Global Ministries",
    });

    const res = await request(app)
      .get("/api/test")
      .set("x-ministry-id", "ktm-tenant-test");

    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(404);
  });
});
