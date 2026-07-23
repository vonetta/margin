const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const User = require("../../models/User");
const Task = require("../../models/Task");
const Event = require("../../models/Event");
const Flyer = require("../../models/Flyer");
const EmailDraft = require("../../models/EmailDraft");

const platformAdminEmail = "platform-admin@margin-test.com";
const ordinaryAdminEmail = "ordinary-admin@margin-test.com";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: { $in: ["pa-test-1", "pa-test-2"] } });
  await User.deleteMany({ email: { $in: [platformAdminEmail, ordinaryAdminEmail] } });
  await Task.deleteMany({ ministry_id: "pa-test-1" });
  await Event.deleteMany({ ministry_id: "pa-test-1" });
  await Flyer.deleteMany({ ministry_id: "pa-test-1" });
  await EmailDraft.deleteMany({ ministry_id: "pa-test-1" });
});

let platformAdminToken;
let ordinaryAdminToken;

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: { $in: ["pa-test-1", "pa-test-2"] } });
  await User.deleteMany({ email: { $in: [platformAdminEmail, ordinaryAdminEmail] } });
  await Task.deleteMany({ ministry_id: "pa-test-1" });
  await Event.deleteMany({ ministry_id: "pa-test-1" });
  await Flyer.deleteMany({ ministry_id: "pa-test-1" });
  await EmailDraft.deleteMany({ ministry_id: "pa-test-1" });

  await Ministry.create({ ministry_id: "pa-test-1", name: "Ministry One", plan: "small" });
  await Ministry.create({ ministry_id: "pa-test-2", name: "Ministry Two", plan: "enterprise" });

  const platformAdminRes = await request(app).post("/api/auth/register").send({
    email: platformAdminEmail,
    password: "Password123",
    name: "Platform Admin",
    ministry_id: "pa-test-2",
  });
  platformAdminToken = platformAdminRes.body.token;
  await User.findOneAndUpdate({ email: platformAdminEmail }, { is_platform_admin: true });

  const ordinaryAdminRes = await request(app).post("/api/auth/register").send({
    email: ordinaryAdminEmail,
    password: "Password123",
    name: "Ordinary Admin",
    ministry_id: "pa-test-1",
  });
  ordinaryAdminToken = ordinaryAdminRes.body.token;
});

describe("GET /api/platform-admin/ministries", () => {
  it("returns 401 with no token", async () => {
    const res = await request(app).get("/api/platform-admin/ministries");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app)
      .get("/api/platform-admin/ministries")
      .set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a regular user, even one who's an admin of their own ministry", async () => {
    const res = await request(app)
      .get("/api/platform-admin/ministries")
      .set("Authorization", `Bearer ${ordinaryAdminToken}`);
    expect(res.status).toBe(403);
  });

  it("lists every ministry with a member count, including ones the platform admin doesn't belong to", async () => {
    const res = await request(app)
      .get("/api/platform-admin/ministries")
      .set("Authorization", `Bearer ${platformAdminToken}`);

    expect(res.status).toBe(200);
    const one = res.body.find((m) => m.ministry_id === "pa-test-1");
    const two = res.body.find((m) => m.ministry_id === "pa-test-2");
    expect(one).toMatchObject({ name: "Ministry One", plan: "small", member_count: 1 });
    expect(two).toMatchObject({ name: "Ministry Two", plan: "enterprise", member_count: 1 });
  });

  it("does not require an x-ministry-id header", async () => {
    const res = await request(app)
      .get("/api/platform-admin/ministries")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    expect(res.status).not.toBe(400);
  });
});

describe("GET /api/platform-admin/ministries/:id/overview", () => {
  it("returns 403 for a non-platform-admin", async () => {
    const res = await request(app)
      .get("/api/platform-admin/ministries/pa-test-1/overview")
      .set("Authorization", `Bearer ${ordinaryAdminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent ministry", async () => {
    const res = await request(app)
      .get("/api/platform-admin/ministries/does-not-exist/overview")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(404);
  });

  it("returns the team and recent activity for a ministry the platform admin isn't a member of", async () => {
    await Task.create({
      ministry_id: "pa-test-1",
      title: "Set up chairs",
      assigned_to: "someone",
      assigned_by: "someone",
    });
    await Event.create({
      ministry_id: "pa-test-1",
      title: "Sunday Service",
      start: new Date(),
      end: new Date(),
    });
    await Flyer.create({
      ministry_id: "pa-test-1",
      title: "Welcome Flyer",
      layout: "monument",
      social_url: "https://example.com/f.png",
    });
    await EmailDraft.create({
      ministry_id: "pa-test-1",
      type: "invitation",
      recipient_name: "Someone",
      subject: "Come join us",
      body: "Details...",
    });

    const res = await request(app)
      .get("/api/platform-admin/ministries/pa-test-1/overview")
      .set("Authorization", `Bearer ${platformAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ministry).toMatchObject({ ministry_id: "pa-test-1", name: "Ministry One" });
    expect(res.body.team).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Ordinary Admin", role: "admin" })]),
    );
    expect(res.body.recent_tasks[0]).toMatchObject({ title: "Set up chairs" });
    expect(res.body.recent_events[0]).toMatchObject({ title: "Sunday Service" });
    expect(res.body.recent_flyers[0]).toMatchObject({ title: "Welcome Flyer" });
    expect(res.body.recent_drafts[0]).toMatchObject({ subject: "Come join us" });
  });
});
