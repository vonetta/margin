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

  it("returns 401 with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
