const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const User = require("../../models/User");
const Ministry = require("../../models/Ministry");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

const secondMinistry = {
  ministry_id: "second-test",
  name: "Second Ministry",
  plan: "small",
};

const testUser = {
  email: "test@ktm.com",
  password: "Password123",
  name: "Test User",
  ministry_id: "ktm-test",
  role: "admin",
};

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await User.deleteMany({ email: "test@ktm.com" });
  await Ministry.deleteMany({
    ministry_id: { $in: ["ktm-test", "second-test"] },
  });
});

beforeEach(async () => {
  await User.deleteMany({ email: "test@ktm.com" });
  await Ministry.deleteMany({
    ministry_id: { $in: ["ktm-test", "second-test"] },
  });
  await Ministry.create(testMinistry);
  await Ministry.create(secondMinistry);
});

describe("POST /api/auth/register", () => {
  it("registers a new user and returns a token", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("test@ktm.com");
    expect(res.body.user.ministries).toHaveLength(1);
    expect(res.body.user.password).toBeUndefined();
  });

  it("adds a second ministry to an existing user", async () => {
    await request(app).post("/api/auth/register").send(testUser);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, ministry_id: "second-test", role: "team" });

    expect(res.status).toBe(201);
    expect(res.body.user.ministries).toHaveLength(2);
  });

  it("rejects duplicate ministry membership", async () => {
    await request(app).post("/api/auth/register").send(testUser);
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Already a member of this ministry");
  });

  it("rejects invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, email: "notanemail" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Valid email is required");
  });

  it("rejects short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe(
      "Password must be at least 8 characters",
    );
  });

  it("rejects registration for unknown ministry", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, ministry_id: "unknown" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Ministry not found");
  });

  it("never returns password in response", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.body.user.password).toBeUndefined();
  });

  it("blocks registering past a small plan's team member cap (5)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/register").send({
        email: `cap-user-${i}@second.com`,
        password: "Password123",
        name: `Cap User ${i}`,
        ministry_id: "second-test",
      });
      expect(res.status).toBe(201);
    }

    const res = await request(app).post("/api/auth/register").send({
      email: "cap-user-6@second.com",
      password: "Password123",
      name: "Sixth User",
      ministry_id: "second-test",
    });
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("small plan allows up to 5 team members");

    await User.deleteMany({ email: { $regex: /^cap-user-/ } });
  });
});

describe("POST /api/auth/register-ministry", () => {
  const newMinistryPayload = {
    ministry_id: "brand-new-test",
    ministry_name: "Brand New Test Ministry",
    email: "founder@brandnew.com",
    password: "Password123",
    name: "Founding Admin",
  };

  afterEach(async () => {
    await User.deleteMany({ email: "founder@brandnew.com" });
    await Ministry.deleteMany({ ministry_id: "brand-new-test" });
    const AiProfile = require("../../models/AiProfile");
    await AiProfile.deleteMany({ ministry_id: "brand-new-test" });
  });

  it("creates a new ministry, an empty AI profile, and an admin user in one call", async () => {
    const res = await request(app)
      .post("/api/auth/register-ministry")
      .send(newMinistryPayload);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.ministries).toEqual([
      { ministry_id: "brand-new-test", role: "admin" },
    ]);

    const ministry = await Ministry.findOne({ ministry_id: "brand-new-test" });
    expect(ministry.name).toBe("Brand New Test Ministry");
    expect(ministry.onboarding_complete).toBe(false);

    const AiProfile = require("../../models/AiProfile");
    const profile = await AiProfile.findOne({ ministry_id: "brand-new-test" });
    expect(profile).not.toBeNull();
  });

  it("rejects a ministry_id that's already in use", async () => {
    await request(app).post("/api/auth/register-ministry").send(newMinistryPayload);

    const res = await request(app)
      .post("/api/auth/register-ministry")
      .send({ ...newMinistryPayload, email: "someone-else@brandnew.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ministry ID already in use");

    await User.deleteMany({ email: "someone-else@brandnew.com" });
  });

  it("rejects an invalid ministry_id slug", async () => {
    const res = await request(app)
      .post("/api/auth/register-ministry")
      .send({ ...newMinistryPayload, ministry_id: "Not A Slug!" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe(
      "Ministry ID must be lowercase letters, numbers, and hyphens only",
    );
  });

  it("lets an existing user found a second, separate ministry", async () => {
    await request(app).post("/api/auth/register").send(testUser);

    const res = await request(app).post("/api/auth/register-ministry").send({
      ...newMinistryPayload,
      email: testUser.email,
      password: testUser.password,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ministries).toHaveLength(2);
    expect(res.body.user.ministries).toContainEqual({
      ministry_id: "brand-new-test",
      role: "admin",
    });
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(testUser);
  });

  it("logs in with valid credentials and returns token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.ministries).toHaveLength(1);
  });

  it("rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("rejects unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@ktm.com", password: "Password123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("never returns password in response", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.body.user.password).toBeUndefined();
  });
});

describe("Protected routes require auth", () => {
  it("returns 401 on protected route without token", async () => {
    const res = await request(app)
      .get("/api/ministry")
      .set("x-ministry-id", "ktm-test");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("returns 403 when user has no membership in requested ministry", async () => {
    await request(app).post("/api/auth/register").send(testUser);
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    const res = await request(app)
      .get("/api/ministry")
      .set("x-ministry-id", "second-test")
      .set("Authorization", `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied to this ministry");
  });

  it("returns 401 with invalid token", async () => {
    const res = await request(app)
      .get("/api/ministry")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", "Bearer invalidtoken");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token");
  });
});

describe("GET /api/auth/me", () => {
  it("enriches each membership with the ministry's name", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${registerRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.ministries).toHaveLength(1);
    expect(res.body.ministries[0]).toMatchObject({
      ministry_id: "ktm-test",
      role: "admin",
      name: "Khy Traylor Global Ministries",
    });
    expect(res.body.password).toBeUndefined();
  });

  it("includes each ministry's brand color, for color-coding events across ministries", async () => {
    await Ministry.findOneAndUpdate(
      { ministry_id: "ktm-test" },
      { "branding.colors.primary": "#03293F" },
    );
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${registerRes.body.token}`);

    expect(res.body.ministries[0].color).toBe("#03293F");
  });

  it("returns 401 with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
