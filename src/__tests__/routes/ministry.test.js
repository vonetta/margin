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

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({
    ministry_id: { $in: ["ktm-test", "salt-light-test"] },
  });
  await AiProfile.deleteMany({ ministry_id: "salt-light-test" });
  await User.deleteMany({
    email: { $in: ["ministry-test@ktm.com", "ministry-team-test@ktm.com"] },
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
  await User.deleteMany({
    email: { $in: ["ministry-test@ktm.com", "ministry-team-test@ktm.com"] },
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

  authToken = res.body.token;
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
