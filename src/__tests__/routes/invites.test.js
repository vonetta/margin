const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const User = require("../../models/User");
const Invite = require("../../models/Invite");

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
  await Invite.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["invites-admin@ktm.com", "invites-team@ktm.com", "newperson@ktm.com"] },
  });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Invite.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["invites-admin@ktm.com", "invites-team@ktm.com", "newperson@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const a = await request(app).post("/api/auth/register").send({
    email: "invites-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = a.body.token;

  const t = await request(app).post("/api/auth/register").send({
    email: "invites-team@ktm.com",
    password: "Password123",
    name: "Team",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = t.body.token;
});

describe("POST /api/invites", () => {
  it("creates an invite with a link for a new email as a leader", async () => {
    const res = await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "newperson@ktm.com", name: "New Person", role: "leader" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("leader");
    expect(res.body.invite_link).toContain("/join/");
    expect(res.body.token).toBeTruthy();
  });

  it("rejects a non-admin (team) from sending invites", async () => {
    const res = await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ email: "newperson@ktm.com" });
    expect(res.status).toBe(403);
  });

  it("rejects inviting someone who's already a member", async () => {
    const res = await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "invites-team@ktm.com" });
    expect(res.status).toBe(400);
  });

  it("returns the existing invite instead of duplicating it", async () => {
    const first = await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "newperson@ktm.com" });

    const second = await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "newperson@ktm.com" });

    expect(second.status).toBe(200);
    expect(second.body.token).toBe(first.body.token);

    const invites = await Invite.find({ ministry_id: "ktm-test", email: "newperson@ktm.com" });
    expect(invites.length).toBe(1);
  });
});

describe("plan limits on POST /api/invites", () => {
  afterEach(async () => {
    await Ministry.deleteMany({ ministry_id: "invite-cap-test" });
    await Invite.deleteMany({ ministry_id: "invite-cap-test" });
    await User.deleteMany({ email: { $regex: /@invite-cap\.com$/ } });
  });

  it("counts active members plus pending invites against the team cap", async () => {
    await Ministry.create({ ministry_id: "invite-cap-test", name: "Invite Cap Test", plan: "small" });
    const admin = await request(app).post("/api/auth/register").send({
      email: "admin@invite-cap.com",
      password: "Password123",
      name: "Admin",
      ministry_id: "invite-cap-test",
      role: "admin",
    });
    const token = admin.body.token;

    // 1 active member (the admin) + 4 pending invites = 5, at the small
    // plan's cap — a 5th invite should be refused before ever reaching
    // an inbox.
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/invites")
        .set("x-ministry-id", "invite-cap-test")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: `invitee-${i}@invite-cap.com` });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "invite-cap-test")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "one-too-many@invite-cap.com" });
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("small plan allows up to 5 team members");
  });
});

describe("GET /api/invites", () => {
  it("lists pending invites for this ministry", async () => {
    await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "team",
      invited_by: "someone",
    });

    const res = await request(app)
      .get("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].invite_link).toContain("/join/");
  });
});

describe("DELETE /api/invites/:id", () => {
  it("revokes a pending invite", async () => {
    const invite = await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "team",
      invited_by: "someone",
    });

    const res = await request(app)
      .delete(`/api/invites/${invite._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const updated = await Invite.findById(invite._id);
    expect(updated.status).toBe("revoked");
  });
});

describe("GET /api/public/invites/:token", () => {
  it("returns ministry/role info for a valid pending invite, no auth required", async () => {
    const invite = await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "leader",
      invited_by: "someone",
    });

    const res = await request(app).get(`/api/public/invites/${invite.token}`);
    expect(res.status).toBe(200);
    expect(res.body.ministry_name).toBe("Khy Traylor Global Ministries");
    expect(res.body.role).toBe("leader");
    expect(res.body.email).toBe("newperson@ktm.com");
  });

  it("404s for an unknown token", async () => {
    const res = await request(app).get("/api/public/invites/not-a-real-token");
    expect(res.status).toBe(404);
  });

  it("404s for an already-accepted invite", async () => {
    const invite = await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "team",
      invited_by: "someone",
      status: "accepted",
    });

    const res = await request(app).get(`/api/public/invites/${invite.token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/register with an invite_token", () => {
  it("assigns the invite's role (not the register form's) and marks the invite accepted", async () => {
    const invite = await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "leader",
      invited_by: "someone",
    });

    const res = await request(app).post("/api/auth/register").send({
      email: "newperson@ktm.com",
      password: "Password123",
      name: "New Person",
      ministry_id: "ktm-test",
      role: "admin", // attempting to self-grant admin — invite.role should win
      invite_token: invite.token,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ministries[0].role).toBe("leader");

    const updated = await Invite.findById(invite._id);
    expect(updated.status).toBe("accepted");
    expect(updated.accepted_at).toBeTruthy();
  });

  it("rejects an invite token whose email doesn't match the registration email", async () => {
    const invite = await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "leader",
      invited_by: "someone",
    });

    const res = await request(app).post("/api/auth/register").send({
      email: "someone-else@ktm.com",
      password: "Password123",
      name: "Someone Else",
      ministry_id: "ktm-test",
      invite_token: invite.token,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an expired invite token", async () => {
    const invite = await Invite.create({
      ministry_id: "ktm-test",
      email: "newperson@ktm.com",
      role: "leader",
      invited_by: "someone",
      expires_at: new Date(Date.now() - 1000),
    });

    const res = await request(app).post("/api/auth/register").send({
      email: "newperson@ktm.com",
      password: "Password123",
      name: "New Person",
      ministry_id: "ktm-test",
      invite_token: invite.token,
    });
    expect(res.status).toBe(400);
  });

  it("still hard-locks a non-invited registrant (after the first member) to team", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "newperson@ktm.com",
      password: "Password123",
      name: "New Person",
      ministry_id: "ktm-test",
      role: "admin",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.ministries[0].role).toBe("team");
  });
});
