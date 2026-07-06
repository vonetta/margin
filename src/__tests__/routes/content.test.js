const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const AiProfile = require("../../models/AiProfile");
const ContentDraft = require("../../models/ContentDraft");
const User = require("../../models/User");

const mockChatTurn = jest.fn();
jest.mock("../../services/generationService", () => ({
  generateContent: jest
    .fn()
    .mockResolvedValue(
      "Worshipers, I believe this is your moment to be poured back into !!!\n\nJuly 20th we are hosting a Worship Workshop from 12pm to 6pm.\n\nSecure your spot today. Link in bio.\n\n#KTM #KhyTraylorMinistries #EquippingLeaders #ChangingLives",
    ),
  chatTurn: (...args) => mockChatTurn(...args),
}));

const mockExtractFlyerDetails = jest.fn();
jest.mock("../../services/imageService", () => ({
  extractFlyerDetails: (...args) => mockExtractFlyerDetails(...args),
}));

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
  onboarding_complete: true,
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
  ctas: { enrollment: "Secure your spot" },
  sops: [],
  templates: [],
  recurring_content: [],
};

let authToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await ContentDraft.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "content-test@ktm.com" });
});

beforeEach(async () => {
  mockChatTurn.mockReset();
  mockExtractFlyerDetails.mockReset();
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await ContentDraft.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "content-test@ktm.com" });
  await Ministry.create(testMinistry);
  await AiProfile.create(testProfile);

  const res = await request(app).post("/api/auth/register").send({
    email: "content-test@ktm.com",
    password: "Password123",
    name: "Test Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });

  authToken = res.body.token;
});

describe("POST /api/content/generate", () => {
  it("generates content and creates a draft", async () => {
    const res = await request(app)
      .post("/api/content/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        prompt: "Worship Workshop July 20 12pm-6pm $100 lunch provided",
        platform: "Instagram",
      });

    expect(res.status).toBe(201);
    expect(res.body.caption).toBeDefined();
    expect(res.body.status).toBe("pending");
    expect(res.body.platform).toBe("Instagram");
    expect(res.body.draft_id).toBeDefined();
  });

  it("rejects missing prompt", async () => {
    const res = await request(app)
      .post("/api/content/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ platform: "Instagram" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Prompt is required");
  });

  it("rejects invalid platform", async () => {
    const res = await request(app)
      .post("/api/content/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        prompt: "Worship Workshop July 20",
        platform: "TikTok",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toContain("Platform must be one of");
  });

  it("rejects missing platform", async () => {
    const res = await request(app)
      .post("/api/content/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ prompt: "Worship Workshop July 20" });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe("Platform is required");
  });
});

describe("GET /api/content/drafts", () => {
  it("returns all drafts for the ministry", async () => {
    await ContentDraft.create({
      ministry_id: "ktm-test",
      prompt: "Test prompt",
      platform: "Instagram",
      caption: "Test caption",
      status: "pending",
    });

    const res = await request(app)
      .get("/api/content/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].caption).toBe("Test caption");
  });

  it("filters drafts by status", async () => {
    await ContentDraft.create([
      {
        ministry_id: "ktm-test",
        prompt: "p1",
        platform: "Instagram",
        caption: "c1",
        status: "pending",
      },
      {
        ministry_id: "ktm-test",
        prompt: "p2",
        platform: "Facebook",
        caption: "c2",
        status: "approved",
      },
    ]);

    const res = await request(app)
      .get("/api/content/drafts?status=pending")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe("pending");
  });
});

describe("PUT /api/content/drafts/:id/approve", () => {
  it("approves a draft", async () => {
    const draft = await ContentDraft.create({
      ministry_id: "ktm-test",
      prompt: "Test prompt",
      platform: "Instagram",
      caption: "Test caption",
      status: "pending",
    });

    const res = await request(app)
      .put(`/api/content/drafts/${draft._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.approved_at).toBeDefined();
  });

  it("returns 404 for draft belonging to another ministry", async () => {
    const draft = await ContentDraft.create({
      ministry_id: "other-ministry",
      prompt: "Test prompt",
      platform: "Instagram",
      caption: "Test caption",
      status: "pending",
    });

    const res = await request(app)
      .put(`/api/content/drafts/${draft._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/content/drafts/:id/feedback", () => {
  it("saves feedback and rejects the draft", async () => {
    const draft = await ContentDraft.create({
      ministry_id: "ktm-test",
      prompt: "Test prompt",
      platform: "Instagram",
      caption: "Test caption",
      status: "pending",
    });

    const res = await request(app)
      .put(`/api/content/drafts/${draft._id}/feedback`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ feedback: "Use Cost not Investment for pricing" });

    expect(res.status).toBe(200);
    expect(res.body.feedback).toBe("Use Cost not Investment for pricing");
    expect(res.body.status).toBe("rejected");
  });

  it("rejects empty feedback", async () => {
    const draft = await ContentDraft.create({
      ministry_id: "ktm-test",
      prompt: "Test",
      platform: "Instagram",
      caption: "Test",
      status: "pending",
    });

    const res = await request(app)
      .put(`/api/content/drafts/${draft._id}/feedback`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ feedback: "" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/content/chat", () => {
  it("returns a clarifying question when the model is not done", async () => {
    mockChatTurn.mockResolvedValue({
      done: false,
      message: "Is this a KTM event or a Salt & Light event?",
    });

    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        messages: [{ role: "user", content: "We have an event next week" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(false);
    expect(res.body.message).toBe(
      "Is this a KTM event or a Salt & Light event?",
    );
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[1]).toEqual({
      role: "assistant",
      content: "Is this a KTM event or a Salt & Light event?",
    });
  });

  it("returns the finalized caption when the model is done", async () => {
    mockChatTurn.mockResolvedValue({
      done: true,
      caption: "Final caption text",
    });

    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        messages: [
          { role: "user", content: "We have an event next week" },
          {
            role: "assistant",
            content: "Is this a KTM event or a Salt & Light event?",
          },
          { role: "user", content: "It's a KTM event" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.caption).toBe("Final caption text");
    expect(res.body.messages).toHaveLength(4);
  });

  it("passes through structured event details when the model includes them", async () => {
    mockChatTurn.mockResolvedValue({
      done: true,
      caption: "Final caption text",
      event: { title: "Worship Workshop", date: "July 20" },
    });

    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        messages: [{ role: "user", content: "Worship Workshop July 20" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.event).toEqual({
      title: "Worship Workshop",
      date: "July 20",
    });
  });

  it("passes through a switchTo hand-off without finalizing or asking a question", async () => {
    mockChatTurn.mockResolvedValue({
      done: false,
      switchTo: {
        ministry_id: "second-test",
        note: "Got it — continuing this under Second Ministry.",
      },
      message: "Got it — continuing this under Second Ministry.",
    });

    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        messages: [{ role: "user", content: "It's for the other ministry" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(false);
    expect(res.body.switchTo).toEqual({
      ministry_id: "second-test",
      note: "Got it — continuing this under Second Ministry.",
    });
    expect(res.body.message).toBeUndefined();
    expect(res.body.messages[1]).toEqual({
      role: "assistant",
      content: "Got it — continuing this under Second Ministry.",
    });
  });

  it("rejects a message history that doesn't end with the user", async () => {
    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        messages: [{ role: "assistant", content: "Hello" }],
      });

    expect(res.status).toBe(400);
  });

  it("rejects an empty messages array", async () => {
    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ platform: "Instagram", messages: [] });

    expect(res.status).toBe(400);
  });

  it("returns 404 when there is no AI profile for the ministry", async () => {
    await AiProfile.deleteMany({ ministry_id: "ktm-test" });

    const res = await request(app)
      .post("/api/content/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        messages: [{ role: "user", content: "Hello" }],
      });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/content/drafts", () => {
  it("saves a finalized caption as a pending draft", async () => {
    const res = await request(app)
      .post("/api/content/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        caption: "Final caption text",
        prompt: "We have an event next week",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.caption).toBe("Final caption text");
    expect(res.body.platform).toBe("Instagram");
  });

  it("rejects a missing caption", async () => {
    const res = await request(app)
      .post("/api/content/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ platform: "Instagram", prompt: "We have an event next week" });

    expect(res.status).toBe(400);
  });

  it("saves an optional image_url alongside the caption", async () => {
    const res = await request(app)
      .post("/api/content/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        platform: "Instagram",
        caption: "Final caption text",
        prompt: "We have an event next week",
        image_url: "https://pub-test.r2.dev/ktm-test/flyers/f1.png",
      });

    expect(res.status).toBe(201);
    expect(res.body.image_url).toBe(
      "https://pub-test.r2.dev/ktm-test/flyers/f1.png",
    );
  });
});

describe("POST /api/content/extract-flyer", () => {
  it("returns extracted flyer details", async () => {
    mockExtractFlyerDetails.mockResolvedValue({
      title: "Worship Workshop",
      subtitle: null,
      date: "July 20",
      location: null,
      cost: "$100",
      cta: "Secure your spot",
      registration_url: null,
      other_details: null,
    });

    const res = await request(app)
      .post("/api/content/extract-flyer")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("flyer", Buffer.from("fake-image-bytes"), {
        filename: "flyer.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Worship Workshop");
    expect(res.body.date).toBe("July 20");
  });

  it("rejects when no file is uploaded", async () => {
    const res = await request(app)
      .post("/api/content/extract-flyer")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it("returns 500 when extraction fails", async () => {
    mockExtractFlyerDetails.mockRejectedValue(new Error("Gemini error"));

    const res = await request(app)
      .post("/api/content/extract-flyer")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("flyer", Buffer.from("fake-image-bytes"), {
        filename: "flyer.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(500);
  });
});
