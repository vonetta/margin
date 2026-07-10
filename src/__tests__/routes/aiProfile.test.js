const mockBuildProfileFromWebsite = jest.fn();
jest.mock("../../services/onboardingScraperService", () => ({
  buildProfileFromWebsite: (...a) => mockBuildProfileFromWebsite(...a),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const { registerMember } = require("../../testHelpers/register");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const AiProfile = require("../../models/AiProfile");
const User = require("../../models/User");
const { UrlSafetyError } = require("../../services/urlSafetyService");

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

const SopDraft = require("../../models/SopDraft");

let authToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await SopDraft.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "profile-test@ktm.com" });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  // This suite has historically hung mid-run in this sandbox (Puppeteer)
  // before afterAll cleanup could fire, so stray drafts accumulate in
  // the shared test database — clear them up front, every run.
  await SopDraft.deleteMany({ ministry_id: "ktm-test" });
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
  mockBuildProfileFromWebsite.mockReset();
});

describe("POST /api/profile/onboarding/prefill", () => {
  it("returns the drafted profile for an admin", async () => {
    mockBuildProfileFromWebsite.mockResolvedValue({
      voice_profile: { persona_name: "Grace", tone_pillars: ["warm"], sample_phrases: [], avoid: [] },
      suggested_colors: { primary: "#2b4a7a", accent: "" },
      hashtags: { brand: ["#Grace"], content: [] },
      source: { url: "https://grace.org/", title: "Grace", had_readable_text: true },
    });

    const res = await request(app)
      .post("/api/profile/onboarding/prefill")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ website_url: "https://grace.org" });

    expect(res.status).toBe(200);
    expect(res.body.voice_profile.persona_name).toBe("Grace");
    expect(mockBuildProfileFromWebsite).toHaveBeenCalledWith({
      websiteUrl: "https://grace.org",
      pastPosts: "",
    });
  });

  it("requires a website_url", async () => {
    const res = await request(app)
      .post("/api/profile/onboarding/prefill")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(mockBuildProfileFromWebsite).not.toHaveBeenCalled();
  });

  it("maps a UrlSafetyError (blocked/bad URL) to a 400 with its message", async () => {
    mockBuildProfileFromWebsite.mockRejectedValue(new UrlSafetyError("That address isn't allowed"));
    const res = await request(app)
      .post("/api/profile/onboarding/prefill")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ website_url: "http://169.254.169.254" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("That address isn't allowed");
  });

  it("maps an unexpected model/parse failure to a 500", async () => {
    mockBuildProfileFromWebsite.mockRejectedValue(new Error("Could not parse the drafted profile"));
    const res = await request(app)
      .post("/api/profile/onboarding/prefill")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ website_url: "https://grace.org" });
    expect(res.status).toBe(500);
  });

  it("blocks a team member (admin/leader only)", async () => {
    const team = await registerMember(app, {
      ministry_id: "ktm-test",
      email: "team-test@ktm.com",
      password: "Password123",
      name: "Team",
      role: "team",
    });
    const res = await request(app)
      .post("/api/profile/onboarding/prefill")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${team.body.token}`)
      .send({ website_url: "https://grace.org" });
    expect(res.status).toBe(403);
    await User.deleteMany({ email: "team-test@ktm.com" });
  });
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
    const teamRes = await registerMember(app, {
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

describe("GET /api/profile/sops/drafts", () => {
  it("rejects a team-role user — SOPs can carry payment/vendor detail, same bar as the mutating routes", async () => {
    await User.deleteMany({ email: "team-test@ktm.com" });
    const teamRes = await registerMember(app, {
      email: "team-test@ktm.com",
      password: "Password123",
      name: "Team Member",
      ministry_id: "ktm-test",
      role: "team",
    });

    const res = await request(app)
      .get("/api/profile/sops/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamRes.body.token}`);

    expect(res.status).toBe(403);
    await User.deleteMany({ email: "team-test@ktm.com" });
  });

  it("lists SOP drafts for an admin", async () => {
    await request(app)
      .post("/api/profile/sops")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Sunday Setup", content: "1. Arrange chairs." });

    const res = await request(app)
      .get("/api/profile/sops/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe("pending_review");
  });
});

describe("GET /api/profile/sops/drafts/:id/export", () => {
  const createDraft = async (overrides = {}) => {
    const res = await request(app)
      .post("/api/profile/sops")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Sunday Setup", content: "1. Arrange chairs.", ...overrides });
    return res.body._id;
  };

  it("streams a PDF for an admin", async () => {
    const id = await createDraft();

    const res = await request(app)
      .get(`/api/profile/sops/drafts/${id}/export`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
  }, 20000);

  it("rejects a team-role user", async () => {
    const id = await createDraft();

    await User.deleteMany({ email: "team-test@ktm.com" });
    const teamRes = await registerMember(app, {
      email: "team-test@ktm.com",
      password: "Password123",
      name: "Team Member",
      ministry_id: "ktm-test",
      role: "team",
    });

    const res = await request(app)
      .get(`/api/profile/sops/drafts/${id}/export`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamRes.body.token}`);

    expect(res.status).toBe(403);
    await User.deleteMany({ email: "team-test@ktm.com" });
  });

  it("404s for a draft that doesn't belong to the requesting ministry", async () => {
    // Cleaned up front, not just in afterAll — if a prior run of this
    // suite got interrupted before its own cleanup ran, a stale
    // "other-admin@ktm.com" with a leftover ktm-other-test membership
    // makes this test's own registration 400 ("already a member"),
    // which silently turns the rest of the test into an auth failure
    // instead of the 404 it's meant to check.
    await Ministry.deleteMany({ ministry_id: "ktm-other-test" });
    await User.deleteMany({ email: "other-admin@ktm.com" });
    await Ministry.create({ ministry_id: "ktm-other-test", name: "Other", plan: "enterprise" });
    const otherRes = await request(app).post("/api/auth/register").send({
      email: "other-admin@ktm.com",
      password: "Password123",
      name: "Other Admin",
      ministry_id: "ktm-other-test",
    });

    const id = await createDraft();

    const res = await request(app)
      .get(`/api/profile/sops/drafts/${id}/export`)
      .set("x-ministry-id", "ktm-other-test")
      .set("Authorization", `Bearer ${otherRes.body.token}`);

    expect(res.status).toBe(404);

    await Ministry.deleteMany({ ministry_id: "ktm-other-test" });
    await User.deleteMany({ email: "other-admin@ktm.com" });
  });

  it("appends an audit entry (by, mode, at) to the draft's exports array", async () => {
    const id = await createDraft();

    await request(app)
      .get(`/api/profile/sops/drafts/${id}/export?mode=clean`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    const SopDraft = require("../../models/SopDraft");
    const draft = await SopDraft.findById(id);
    expect(draft.exports.length).toBe(1);
    expect(draft.exports[0].mode).toBe("clean");
  }, 20000);
});
