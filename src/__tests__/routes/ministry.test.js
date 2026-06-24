const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
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

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "ministry-test@ktm.com" });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "ministry-test@ktm.com" });
  await Ministry.create(testMinistry);

  const res = await request(app).post("/api/auth/register").send({
    email: "ministry-test@ktm.com",
    password: "Password123",
    name: "Test Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });

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
