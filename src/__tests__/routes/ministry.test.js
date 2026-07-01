const mockUploadFile = jest.fn();
const mockSafeDeleteFile = jest.fn();
jest.mock("../../services/storageService", () => ({
  uploadFile: (...args) => mockUploadFile(...args),
  safeDeleteFile: (...args) => mockSafeDeleteFile(...args),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const AiProfile = require("../../models/AiProfile");
const User = require("../../models/User");
const Event = require("../../models/Event");
const Task = require("../../models/Task");
const Invite = require("../../models/Invite");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  tagline: "Equipping Leaders. Changing Lives.",
  website: "https://khytraylorministries.com",
  plan: "enterprise",
  branding: {
    colors: {
      primary: "#03293F",
      accent: "#EA8A8B",
      background: "#F0C7C3",
      text: "#1C1C1C",
      gold: "#DAAE4F",
    },
    fonts: { heading: "Cinzel", body: "Montserrat" },
    image_treatment: { text_overlay_opacity: 0.34, image_only_opacity: 0.1 },
  },
};

let authToken;
let teamToken;
let teamUserId;
let authUserId;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({
    ministry_id: { $in: ["ktm-test", "salt-light-test"] },
  });
  await AiProfile.deleteMany({ ministry_id: "salt-light-test" });
  await Event.deleteMany({ ministry_id: "salt-light-test" });
  await Invite.deleteMany({ ministry_id: "ktm-test" });
  await Task.deleteMany({ ministry_id: "salt-light-test" });
  await User.deleteMany({
    email: { $in: ["ministry-test@ktm.com", "ministry-team-test@ktm.com", "salt-light-member@ktm.com"] },
  });
});

beforeEach(async () => {
  mockUploadFile.mockReset();
  mockSafeDeleteFile.mockReset();
  mockUploadFile.mockResolvedValue({
    key: "ktm-test/logos/logo-abc123.png",
    url: "https://pub-test.r2.dev/ktm-test/logos/logo-abc123.png",
  });
  await Ministry.deleteMany({
    ministry_id: { $in: ["ktm-test", "salt-light-test"] },
  });
  await AiProfile.deleteMany({ ministry_id: "salt-light-test" });
  await Event.deleteMany({ ministry_id: "salt-light-test" });
  await Invite.deleteMany({ ministry_id: "ktm-test" });
  await Task.deleteMany({ ministry_id: "salt-light-test" });
  await User.deleteMany({
    email: { $in: ["ministry-test@ktm.com", "ministry-team-test@ktm.com", "salt-light-member@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const res = await request(app).post("/api/auth/register").send({
    email: "ministry-test@ktm.com",
    password: "Password123",
    name: "Test Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });

  const teamRes = await request(app).post("/api/auth/register").send({
    email: "ministry-team-test@ktm.com",
    password: "Password123",
    name: "Test Team",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = teamRes.body.token;
  teamUserId = teamRes.body.user.id;

  authToken = res.body.token;
  authUserId = res.body.user.id;
});

describe("GET /api/ministry", () => {
  it("returns the ministry profile for a valid tenant", async () => {
    const res = await request(app)
      .get("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ministry_id).toBe("ktm-test");
    expect(res.body.name).toBe("Khy Traylor Global Ministries");
  });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .get("/api/ministry")
      .set("x-ministry-id", "ktm-test");

    expect(res.status).toBe(401);
  });

  it("returns 400 with no ministry ID header", async () => {
    const res = await request(app)
      .get("/api/ministry")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown ministry", async () => {
    const res = await request(app)
      .get("/api/ministry")
      .set("x-ministry-id", "unknown")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/ministry/plan-usage", () => {
  it("reports null (unlimited) limits for an enterprise plan", async () => {
    const res = await request(app)
      .get("/api/ministry/plan-usage")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe("enterprise");
    expect(res.body.usage.team_members.limit).toBeNull();
    expect(res.body.usage.sub_ministries.limit).toBeNull();
    expect(res.body.usage.flyers_per_month.limit).toBeNull();
  });

  it("counts pending invites toward team_members usage, not just active members", async () => {
    await request(app)
      .post("/api/invites")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ email: "usage-invitee@ktm.com" });

    const res = await request(app)
      .get("/api/ministry/plan-usage")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.body.usage.team_members.pending_invites).toBe(1);
    expect(res.body.usage.team_members.used).toBe(
      res.body.usage.team_members.active + 1,
    );
  });

  it("is accessible to a team member, not just admin/leader", async () => {
    const res = await request(app)
      .get("/api/ministry/plan-usage")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/ministry", () => {
  it("updates allowed fields", async () => {
    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tagline: "New tagline" });

    expect(res.status).toBe(200);
    expect(res.body.tagline).toBe("New tagline");
  });

  it("rejects invalid website URL", async () => {
    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ website: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Website must be a valid URL");
  });

  it("rejects invalid plan value", async () => {
    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ plan: "invalid-plan" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Invalid plan");
  });

  it("rejects invalid hex color", async () => {
    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ branding: { colors: { primary: "notacolor" } } });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe(
      "Primary color must be a valid hex code",
    );
  });

  it("ignores fields not on the allowed list", async () => {
    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ministry_id: "hacked", name: "Legitimate update" });

    expect(res.status).toBe(200);
    expect(res.body.ministry_id).toBe("ktm-test");
    expect(res.body.name).toBe("Legitimate update");
  });
});

describe("POST /api/ministry/sub-ministries", () => {
  it("creates a sub-ministry linked to the parent", async () => {
    const res = await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ministry_id: "salt-light-test", name: "Salt & Light Test" });

    expect(res.status).toBe(201);
    expect(res.body.ministry_id).toBe("salt-light-test");
    expect(res.body.parent_ministry_id).toBe("ktm-test");

    const profile = await AiProfile.findOne({
      ministry_id: "salt-light-test",
    });
    expect(profile).not.toBeNull();
  });

  it("adds the creating admin as a member of the new sub-ministry", async () => {
    await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ministry_id: "salt-light-test", name: "Salt & Light Test" });

    const user = await User.findOne({ email: "ministry-test@ktm.com" });
    const membership = user.getMembership("salt-light-test");
    expect(membership).not.toBeNull();
    expect(membership.role).toBe("admin");
  });

  it("rejects a duplicate ministry_id", async () => {
    const res = await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ministry_id: "ktm-test", name: "Should fail" });

    expect(res.status).toBe(400);
  });

  it("rejects creation by a non-admin (leader/team)", async () => {
    const res = await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ ministry_id: "salt-light-test", name: "Salt & Light Test" });

    expect(res.status).toBe(403);
  });

  it("rejects an invalid ministry_id slug", async () => {
    const res = await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ministry_id: "Not A Slug!", name: "Salt & Light Test" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/ministry/team", () => {
  it("lists the team members of this ministry with their roles", async () => {
    const res = await request(app)
      .get("/api/ministry/team")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const emails = res.body.map((u) => u.email);
    expect(emails).toContain("ministry-test@ktm.com");
    expect(emails).toContain("ministry-team-test@ktm.com");
    const admin = res.body.find((u) => u.email === "ministry-test@ktm.com");
    expect(admin.role).toBe("admin");
  });

  it("rejects a team-role member (requires admin/leader)", async () => {
    const res = await request(app)
      .get("/api/ministry/team")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/ministry/team/:userId", () => {
  it("promotes a team member to leader", async () => {
    const res = await request(app)
      .put(`/api/ministry/team/${teamUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "leader" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("leader");

    const team = await request(app)
      .get("/api/ministry/team")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);
    expect(team.body.find((u) => u._id === teamUserId).role).toBe("leader");
  });

  it("rejects a non-admin (leader) trying to change a role", async () => {
    await request(app)
      .put(`/api/ministry/team/${teamUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "leader" });

    const res = await request(app)
      .put(`/api/ministry/team/${authUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("refuses to demote the last remaining admin", async () => {
    const res = await request(app)
      .put(`/api/ministry/team/${authUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "team" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last admin/);
  });

  it("allows demoting an admin once a second admin exists", async () => {
    await request(app)
      .put(`/api/ministry/team/${teamUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "admin" });

    const res = await request(app)
      .put(`/api/ministry/team/${authUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "team" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("team");
  });

  it("rejects an invalid role", async () => {
    const res = await request(app)
      .put(`/api/ministry/team/${teamUserId}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "superadmin" });
    expect(res.status).toBe(400);
  });

  it("404s for a user who isn't a member of this ministry", async () => {
    const res = await request(app)
      .put("/api/ministry/team/000000000000000000000000")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ role: "leader" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/ministry/sub-ministries", () => {
  it("lists sub-ministries under the current ministry", async () => {
    await Ministry.create({
      ministry_id: "salt-light-test",
      parent_ministry_id: "ktm-test",
      name: "Salt & Light Test",
    });

    const res = await request(app)
      .get("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].ministry_id).toBe("salt-light-test");
  });

  it("rejects access by a team member", async () => {
    const res = await request(app)
      .get("/api/ministry/sub-ministries")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);

    expect(res.status).toBe(403);
  });
});

describe("plan limits on POST /api/ministry/sub-ministries", () => {
  afterEach(async () => {
    await Ministry.deleteMany({ ministry_id: { $in: ["small-plan-test", "small-sub-a", "small-sub-b", "small-sub-c", "small-sub-d"] } });
    await User.deleteMany({ email: "small-plan-admin@ktm.com" });
    await AiProfile.deleteMany({ ministry_id: { $in: ["small-sub-a", "small-sub-b", "small-sub-c"] } });
  });

  it("blocks a small plan (cap 0) from creating any sub-ministry", async () => {
    await Ministry.create({ ministry_id: "small-plan-test", name: "Small Plan Test", plan: "small" });
    const admin = await request(app).post("/api/auth/register").send({
      email: "small-plan-admin@ktm.com",
      password: "Password123",
      name: "Admin",
      ministry_id: "small-plan-test",
      role: "admin",
    });

    const res = await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "small-plan-test")
      .set("Authorization", `Bearer ${admin.body.token}`)
      .send({ ministry_id: "small-sub-a", name: "Should Fail" });

    expect(res.status).toBe(402);
    expect(res.body.error).toContain("small plan allows up to 0 sub-ministries");
  });

  it("blocks a mid plan from creating a 4th sub-ministry (cap 3)", async () => {
    await Ministry.create({ ministry_id: "small-plan-test", name: "Mid Plan Test", plan: "mid" });
    const admin = await request(app).post("/api/auth/register").send({
      email: "small-plan-admin@ktm.com",
      password: "Password123",
      name: "Admin",
      ministry_id: "small-plan-test",
      role: "admin",
    });
    const token = admin.body.token;

    for (const subId of ["small-sub-a", "small-sub-b", "small-sub-c"]) {
      const res = await request(app)
        .post("/api/ministry/sub-ministries")
        .set("x-ministry-id", "small-plan-test")
        .set("Authorization", `Bearer ${token}`)
        .send({ ministry_id: subId, name: subId });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post("/api/ministry/sub-ministries")
      .set("x-ministry-id", "small-plan-test")
      .set("Authorization", `Bearer ${token}`)
      .send({ ministry_id: "small-sub-d", name: "Fourth Sub" });
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("mid plan allows up to 3 sub-ministries");
  });
});

describe("GET /api/ministry/org-overview", () => {
  it("returns aggregate counts per sub-ministry without exposing individual records", async () => {
    await Ministry.create({
      ministry_id: "salt-light-test",
      parent_ministry_id: "ktm-test",
      name: "Salt & Light Test",
    });
    const subUser = await request(app).post("/api/auth/register").send({
      email: "salt-light-member@ktm.com",
      password: "Password123",
      name: "Sub Member",
      ministry_id: "salt-light-test",
      role: "admin",
    });

    await Event.create({
      ministry_id: "salt-light-test",
      title: "Pending Flyer Event",
      start: new Date(),
      status: "pending",
    });
    await Event.create({
      ministry_id: "salt-light-test",
      title: "Upcoming Approved Event",
      start: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      status: "approved",
    });
    await Task.create({
      ministry_id: "salt-light-test",
      title: "Open Task",
      assigned_to: "someone",
      assigned_by: "someone",
      status: "open",
    });

    const res = await request(app)
      .get("/api/ministry/org-overview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const overview = res.body[0];
    expect(overview.ministry_id).toBe("salt-light-test");
    expect(overview.name).toBe("Salt & Light Test");
    expect(overview.team_count).toBe(1);
    expect(overview.pending_approvals).toBe(1);
    expect(overview.open_tasks).toBe(1);
    expect(overview.upcoming_events).toBe(1);

    // Never leaks individual titles/descriptions/emails — counts only.
    expect(JSON.stringify(overview)).not.toContain("Pending Flyer Event");
    expect(JSON.stringify(overview)).not.toContain("Upcoming Approved Event");
    expect(JSON.stringify(overview)).not.toContain("Open Task");
    expect(JSON.stringify(overview)).not.toContain("salt-light-member@ktm.com");
    expect(subUser.status).toBe(201);
  });

  it("counts a recurring event's occurrences within the 30-day window, not just its anchor date", async () => {
    await Ministry.create({
      ministry_id: "salt-light-test",
      parent_ministry_id: "ktm-test",
      name: "Salt & Light Test",
    });

    // Anchor date is in the past, but the weekly recurrence still
    // produces occurrences inside the next 30 days.
    await Event.create({
      ministry_id: "salt-light-test",
      title: "Weekly Prayer Call",
      start: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      recurrence_rule: "FREQ=WEEKLY",
      status: "approved",
    });

    const res = await request(app)
      .get("/api/ministry/org-overview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.body[0].upcoming_events).toBeGreaterThanOrEqual(4);
  });

  it("rejects a leader (admin-only, stricter than /sub-ministries)", async () => {
    const res = await request(app)
      .get("/api/ministry/org-overview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(403);
  });

  it("returns an empty array when there are no sub-ministries", async () => {
    const res = await request(app)
      .get("/api/ministry/org-overview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/ministry/logo", () => {
  it("uploads a logo and sets branding.logo_url", async () => {
    const res = await request(app)
      .post("/api/ministry/logo")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("logo", Buffer.from("fake-logo-bytes"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(res.body.branding.logo_url).toContain("r2.dev");
    expect(mockSafeDeleteFile).not.toHaveBeenCalled();
  });

  it("cleans up the old logo when replacing it", async () => {
    await Ministry.findOneAndUpdate(
      { ministry_id: "ktm-test" },
      {
        $set: {
          "branding.logo_url": "https://pub-test.r2.dev/old-logo.png",
          "branding.logo_key": "ktm-test/logos/old-logo.png",
        },
      },
    );

    await request(app)
      .post("/api/ministry/logo")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("logo", Buffer.from("fake-logo-bytes"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(mockSafeDeleteFile).toHaveBeenCalledWith(
      "ktm-test/logos/old-logo.png",
    );
  });

  it("rejects upload with no file", async () => {
    const res = await request(app)
      .post("/api/ministry/logo")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it("rejects upload by a team member", async () => {
    const res = await request(app)
      .post("/api/ministry/logo")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .attach("logo", Buffer.from("fake-logo-bytes"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/ministry branding merge", () => {
  it("preserves the logo when updating colors", async () => {
    await Ministry.findOneAndUpdate(
      { ministry_id: "ktm-test" },
      {
        $set: {
          "branding.logo_url": "https://pub-test.r2.dev/logo.png",
          "branding.logo_key": "ktm-test/logos/logo.png",
        },
      },
    );

    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ branding: { colors: { primary: "#112233" } } });

    expect(res.status).toBe(200);
    expect(res.body.branding.logo_url).toBe(
      "https://pub-test.r2.dev/logo.png",
    );
    expect(res.body.branding.colors.primary).toBe("#112233");
  });

  it("preserves sibling color keys when updating one color", async () => {
    await Ministry.findOneAndUpdate(
      { ministry_id: "ktm-test" },
      { $set: { "branding.colors.accent": "#EA8A8B" } },
    );

    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ branding: { colors: { primary: "#112233" } } });

    expect(res.status).toBe(200);
    expect(res.body.branding.colors.accent).toBe("#EA8A8B");
    expect(res.body.branding.colors.primary).toBe("#112233");
  });

  it("sets onboarding_complete", async () => {
    const res = await request(app)
      .put("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ onboarding_complete: true });

    expect(res.status).toBe(200);
    expect(res.body.onboarding_complete).toBe(true);
  });
});
