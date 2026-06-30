const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Event = require("../../models/Event");
const User = require("../../models/User");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

let adminToken, teamToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Event.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["events-admin@ktm.com", "events-team@ktm.com"] },
  });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Event.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["events-admin@ktm.com", "events-team@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const a = await request(app).post("/api/auth/register").send({
    email: "events-admin@ktm.com",
    password: "Password123",
    name: "A",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = a.body.token;

  const t = await request(app).post("/api/auth/register").send({
    email: "events-team@ktm.com",
    password: "Password123",
    name: "T",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = t.body.token;
});

describe("POST /api/events", () => {
  it("creates a one-off event", async () => {
    const res = await request(app)
      .post("/api/events")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Sunday Service",
        start: "2026-08-15T17:00:00Z",
        visibility: "public",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("approved");
    expect(res.body.source).toBe("manual");
  });

  it("creates a recurring event with a valid RRULE", async () => {
    const res = await request(app)
      .post("/api/events")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prayer Call",
        start: "2026-06-02T18:00:00Z",
        recurrence_rule: "FREQ=WEEKLY;BYDAY=TU,TH",
      });
    expect(res.status).toBe(201);
    expect(res.body.recurrence_rule).toBe("FREQ=WEEKLY;BYDAY=TU,TH");
  });

  it("rejects an invalid recurrence rule", async () => {
    const res = await request(app)
      .post("/api/events")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Bad Recurrence",
        start: "2026-06-02T18:00:00Z",
        recurrence_rule: "NOT VALID @@@",
      });
    expect(res.status).toBe(400);
  });

  it("rejects a team member (requires admin/leader)", async () => {
    const res = await request(app)
      .post("/api/events")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ title: "Should fail", start: "2026-06-02T18:00:00Z" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/events", () => {
  it("lets any team member view the ministry's events, regardless of role", async () => {
    await Event.create({
      ministry_id: "ktm-test",
      title: "Team Meeting",
      start: new Date("2026-06-03T18:00:00Z"),
    });

    const res = await request(app)
      .get("/api/events")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe("GET /api/events/expanded", () => {
  it("expands a recurring event into its occurrences within the date range", async () => {
    await Event.create({
      ministry_id: "ktm-test",
      title: "Prayer Call",
      start: new Date("2026-06-02T18:00:00Z"),
      recurrence_rule: "FREQ=WEEKLY;BYDAY=TU,TH",
    });

    const res = await request(app)
      .get("/api/events/expanded?from=2026-06-01T00:00:00Z&to=2026-06-15T00:00:00Z")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
  });

  it("excludes rejected events", async () => {
    await Event.create({
      ministry_id: "ktm-test",
      title: "Rejected Event",
      start: new Date("2026-06-05T18:00:00Z"),
      status: "rejected",
    });

    const res = await request(app)
      .get("/api/events/expanded?from=2026-06-01T00:00:00Z&to=2026-06-15T00:00:00Z")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.body.length).toBe(0);
  });
});

describe("PUT /api/events/:id/approve and /reject", () => {
  it("approves a pending event", async () => {
    const event = await Event.create({
      ministry_id: "ktm-test",
      title: "Pending Event",
      start: new Date("2026-06-05T18:00:00Z"),
      status: "pending",
      source: "flyer",
    });

    const res = await request(app)
      .put(`/api/events/${event._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
  });

  it("rejects a pending event", async () => {
    const event = await Event.create({
      ministry_id: "ktm-test",
      title: "Pending Event",
      start: new Date("2026-06-05T18:00:00Z"),
      status: "pending",
      source: "flyer",
    });

    const res = await request(app)
      .put(`/api/events/${event._id}/reject`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });
});

describe("DELETE /api/events/:id", () => {
  it("deletes an event", async () => {
    const event = await Event.create({
      ministry_id: "ktm-test",
      title: "To Delete",
      start: new Date("2026-06-05T18:00:00Z"),
    });

    const res = await request(app)
      .delete(`/api/events/${event._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const remaining = await Event.findById(event._id);
    expect(remaining).toBeNull();
  });
});
