const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const AiProfile = require("../../models/AiProfile");
const User = require("../../models/User");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

const testProfile = {
  ministry_id: "ktm-test",
  voice_profile: {
    persona_name: "Apostle Khy",
    sign_off: "Love and Blessings, Apostle Khy",
    tone_pillars: ["Apostolic weight", "Relational warmth", "Polished clarity"],
    sample_phrases: ["Secure your spot today !!!"],
    avoid: ["em dashes", "manufactured hype"],
  },
  platforms: ["Instagram", "Facebook", "Email"],
  hashtags: {
    brand: ["#KTM", "#KhyTraylorMinistries"],
    content: ["#Apostolic", "#Prophetic"],
  },
};

let authToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "profile-test@ktm.com" });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "profile-test@ktm.com" });
  await Ministry.create(testMinistry);
  await AiProfile.create(testProfile);

  const res = await request(app).post("/api/auth/register").send({
    email: "profile-test@ktm.com",
    password: "Password123",
    name: "Test Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });

  authToken = res.body.token;
});

describe("GET /api/profile", () => {
  it("returns the AI profile for a valid tenant", async () => {
    const res = await request(app)
      .get("/api/profile")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ministry_id).toBe("ktm-test");
    expect(res.body.voice_profile.persona_name).toBe("Apostle Khy");
  });

  it("returns 404 if no profile exists", async () => {
    await AiProfile.deleteMany({ ministry_id: "ktm-test" });
    const res = await request(app)
      .get("/api/profile")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/profile/voice", () => {
  it("updates voice profile fields", async () => {
    const res = await request(app)
      .put("/api/profile/voice")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ persona_name: "Apostle Khy Traylor" });

    expect(res.status).toBe(200);
    expect(res.body.persona_name).toBe("Apostle Khy Traylor");
  });

  it("rejects empty persona name", async () => {
    const res = await request(app)
      .put("/api/profile/voice")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ persona_name: "" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Persona name cannot be empty");
  });

  it("rejects non-array tone pillars", async () => {
    const res = await request(app)
      .put("/api/profile/voice")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tone_pillars: "not an array" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Tone pillars must be an array");
  });
});

describe("PUT /api/profile/hashtags", () => {
  it("updates brand and content hashtags", async () => {
    const res = await request(app)
      .put("/api/profile/hashtags")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ brand: ["#SaltAndLight"], content: ["#Community"] });

    expect(res.status).toBe(200);
    expect(res.body.brand).toEqual(["#SaltAndLight"]);
    expect(res.body.content).toEqual(["#Community"]);
  });

  it("rejects a non-array brand value", async () => {
    const res = await request(app)
      .put("/api/profile/hashtags")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ brand: "#NotAnArray" });

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/profile/ctas", () => {
  it("replaces the CTA map", async () => {
    const res = await request(app)
      .put("/api/profile/ctas")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ctas: { enrollment: "Join us today" } });

    expect(res.status).toBe(200);
    expect(res.body.enrollment).toBe("Join us today");
  });

  it("rejects a non-object ctas value", async () => {
    const res = await request(app)
      .put("/api/profile/ctas")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ctas: "not an object" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/profile/phrases", () => {
  it("adds a new sample phrase", async () => {
    const res = await request(app)
      .post("/api/profile/phrases")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ phrase: "We are so honored to walk with you !!!" });

    expect(res.status).toBe(200);
    expect(res.body).toContain("We are so honored to walk with you !!!");
  });

  it("does not add duplicate phrases", async () => {
    await request(app)
      .post("/api/profile/phrases")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ phrase: "Unique phrase" });

    await request(app)
      .post("/api/profile/phrases")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ phrase: "Unique phrase" });

    const res = await request(app)
      .get("/api/profile")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    const count = res.body.voice_profile.sample_phrases.filter(
      (p) => p === "Unique phrase",
    ).length;

    expect(count).toBe(1);
  });

  it("rejects empty phrase", async () => {
    const res = await request(app)
      .post("/api/profile/phrases")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ phrase: "" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/profile/phrases", () => {
  it("removes an existing phrase", async () => {
    const res = await request(app)
      .delete("/api/profile/phrases")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ phrase: "Secure your spot today !!!" });

    expect(res.status).toBe(200);
    expect(res.body).not.toContain("Secure your spot today !!!");
  });
});

describe("POST /api/profile/feedback", () => {
  it("logs feedback to the profile", async () => {
    const res = await request(app)
      .post("/api/profile/feedback")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        feedback: "Use Cost not Investment for pricing",
        draft_title: "Worship Workshop",
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Feedback logged to profile");
    expect(res.body.entry.content).toBe("Use Cost not Investment for pricing");
  });

  it("rejects empty feedback", async () => {
    const res = await request(app)
      .post("/api/profile/feedback")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ feedback: "" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/profile/sops", () => {
  it("adds a new SOP as a pending_review draft, same review gate as an AI-drafted one", async () => {
    const res = await request(app)
      .post("/api/profile/sops")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        title: "Worship Workshop SOP",
        content: "Doors open 30 minutes early. Sound check at 11am.",
        tags: ["worship", "event"],
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Worship Workshop SOP");
    expect(res.body.status).toBe("pending_review");
  });

  it("rejects SOP with missing content", async () => {
    const res = await request(app)
      .post("/api/profile/sops")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Missing content SOP" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Content is required");
  });
});

describe("Role enforcement on profile edits", () => {
  it("rejects a team-role user from editing voice profile", async () => {
    await User.deleteMany({ email: "team-test@ktm.com" });
    const teamRes = await request(app).post("/api/auth/register").send({
      email: "team-test@ktm.com",
      password: "Password123",
      name: "Team Member",
      ministry_id: "ktm-test",
      role: "team",
    });

    const teamToken = teamRes.body.token;

    const res = await request(app)
      .put("/api/profile/voice")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ persona_name: "Should Not Work" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient permissions");

    await User.deleteMany({ email: "team-test@ktm.com" });
  });
});
