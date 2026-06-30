const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Event = require("../../models/Event");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Event.deleteMany({ ministry_id: "ktm-test" });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Event.deleteMany({ ministry_id: "ktm-test" });
  await Ministry.create(testMinistry);
});

describe("GET /api/public/calendar/:ministry_id.ics", () => {
  it("requires no authentication at all", async () => {
    const res = await request(app).get("/api/public/calendar/ktm-test.ics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/calendar");
  });

  it("includes only approved + public events, never internal or pending ones", async () => {
    await Event.create({
      ministry_id: "ktm-test",
      title: "Public Sunday Service",
      start: new Date("2026-08-15T17:00:00Z"),
      visibility: "public",
      status: "approved",
    });
    await Event.create({
      ministry_id: "ktm-test",
      title: "Internal Staff Meeting",
      start: new Date("2026-08-16T17:00:00Z"),
      visibility: "internal",
      status: "approved",
    });
    await Event.create({
      ministry_id: "ktm-test",
      title: "Pending Flyer Event",
      start: new Date("2026-08-17T17:00:00Z"),
      visibility: "public",
      status: "pending",
    });

    const res = await request(app).get("/api/public/calendar/ktm-test.ics");
    expect(res.text).toContain("Public Sunday Service");
    expect(res.text).not.toContain("Internal Staff Meeting");
    expect(res.text).not.toContain("Pending Flyer Event");
  });

  it("returns 404 for an unknown ministry", async () => {
    const res = await request(app).get("/api/public/calendar/no-such-ministry.ics");
    expect(res.status).toBe(404);
  });
});
