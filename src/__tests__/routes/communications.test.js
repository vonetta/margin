const mockEmailChatTurn = jest.fn();
jest.mock("../../services/emailService", () => ({
  emailChatTurn: (...args) => mockEmailChatTurn(...args),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const AiProfile = require("../../models/AiProfile");
const EmailDraft = require("../../models/EmailDraft");
const Person = require("../../models/Person");
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
    tone_pillars: ["Apostolic weight"],
    sample_phrases: ["Secure your spot today"],
    avoid: ["em dashes"],
  },
  hashtags: { brand: [], content: [] },
  ctas: {},
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
  await EmailDraft.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "comms-test@ktm.com" });
});

beforeEach(async () => {
  mockEmailChatTurn.mockReset();
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await EmailDraft.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "comms-test@ktm.com" });
  await Ministry.create(testMinistry);
  await AiProfile.create(testProfile);

  const res = await request(app).post("/api/auth/register").send({
    email: "comms-test@ktm.com",
    password: "Password123",
    name: "Test Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  authToken = res.body.token;
});

describe("POST /api/communications/chat", () => {
  it("returns done:false with the question when the model asks for more info", async () => {
    mockEmailChatTurn.mockResolvedValue({
      done: false,
      message: "What's the honorarium amount?",
    });

    const res = await request(app)
      .post("/api/communications/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "confirmation",
        recipient_name: "Dr. Robert Rush III",
        messages: [{ role: "user", content: "Confirming his slot at the workshop" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(false);
    expect(res.body.message).toBe("What's the honorarium amount?");
  });

  it("returns done:true with subject and body when the model finalizes", async () => {
    mockEmailChatTurn.mockResolvedValue({
      done: true,
      subject: "Confirming Your Ministry Assignment",
      body: "Dear Dr. Robert,\n\nGreetings...",
    });

    const res = await request(app)
      .post("/api/communications/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "confirmation",
        recipient_name: "Dr. Robert Rush III",
        messages: [{ role: "user", content: "Friday June 12, 7pm, Castaic CA, $850" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.subject).toBe("Confirming Your Ministry Assignment");
    expect(res.body.body).toContain("Dear Dr. Robert");
  });

  it("rejects an invalid email type", async () => {
    const res = await request(app)
      .post("/api/communications/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "spam",
        recipient_name: "Dr. Robert",
        messages: [{ role: "user", content: "hi" }],
      });
    expect(res.status).toBe(400);
  });

  it("rejects a conversation that doesn't end on a user message", async () => {
    const res = await request(app)
      .post("/api/communications/chat")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "invitation",
        recipient_name: "Dr. Robert",
        messages: [{ role: "assistant", content: "Got it" }],
      });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/communications/drafts", () => {
  it("saves a finalized email draft", async () => {
    const res = await request(app)
      .post("/api/communications/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "confirmation",
        recipient_name: "Dr. Robert Rush III",
        recipient_email: "robert@example.com",
        subject: "Confirming Your Ministry Assignment",
        body: "Dear Dr. Robert,\n\nGreetings...",
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("confirmation");
    expect(res.body.status).toBe("draft");
    expect(res.body.recipient_email).toBe("robert@example.com");
  });

  it("pulls the recipient's email from their People record when not given directly", async () => {
    const person = await Person.create({
      ministry_id: "ktm-test",
      name: "Dr. Robert Rush III",
      role: "speaker",
      email: "fromroster@example.com",
    });

    const res = await request(app)
      .post("/api/communications/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "invitation",
        recipient_name: "Dr. Robert Rush III",
        recipient_person_id: person._id.toString(),
        subject: "An Invitation",
        body: "Dear Dr. Robert...",
      });

    expect(res.status).toBe(201);
    expect(res.body.recipient_email).toBe("fromroster@example.com");
  });

  it("rejects a draft with no subject", async () => {
    const res = await request(app)
      .post("/api/communications/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "invitation",
        recipient_name: "Dr. Robert",
        body: "Dear Dr. Robert...",
      });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/communications/drafts", () => {
  it("returns drafts for the ministry, filterable by type", async () => {
    await EmailDraft.create({
      ministry_id: "ktm-test",
      type: "confirmation",
      recipient_name: "A",
      subject: "S1",
      body: "B1",
    });
    await EmailDraft.create({
      ministry_id: "ktm-test",
      type: "reminder",
      recipient_name: "B",
      subject: "S2",
      body: "B2",
    });

    const all = await request(app)
      .get("/api/communications/drafts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);
    expect(all.body.length).toBe(2);

    const filtered = await request(app)
      .get("/api/communications/drafts?type=reminder")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);
    expect(filtered.body.length).toBe(1);
    expect(filtered.body[0].type).toBe("reminder");
  });
});

describe("PUT /api/communications/drafts/:id", () => {
  it("updates the subject and body of a saved draft", async () => {
    const draft = await EmailDraft.create({
      ministry_id: "ktm-test",
      type: "invitation",
      recipient_name: "A",
      subject: "Original Subject",
      body: "Original body",
    });

    const res = await request(app)
      .put(`/api/communications/drafts/${draft._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ subject: "Updated Subject", body: "Updated body" });

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe("Updated Subject");
    expect(res.body.body).toBe("Updated body");

    const updated = await EmailDraft.findById(draft._id);
    expect(updated.subject).toBe("Updated Subject");
  });

  it("404s for a draft in another ministry", async () => {
    const draft = await EmailDraft.create({
      ministry_id: "other-ministry",
      type: "invitation",
      recipient_name: "A",
      subject: "S",
      body: "B",
    });

    const res = await request(app)
      .put(`/api/communications/drafts/${draft._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ subject: "Hijacked" });
    expect(res.status).toBe(404);

    await EmailDraft.deleteOne({ _id: draft._id });
  });

  it("rejects an empty subject", async () => {
    const draft = await EmailDraft.create({
      ministry_id: "ktm-test",
      type: "invitation",
      recipient_name: "A",
      subject: "S",
      body: "B",
    });

    const res = await request(app)
      .put(`/api/communications/drafts/${draft._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ subject: "" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/communications/drafts/:id", () => {
  it("deletes a draft", async () => {
    const draft = await EmailDraft.create({
      ministry_id: "ktm-test",
      type: "thank_you",
      recipient_name: "A",
      subject: "S",
      body: "B",
    });

    const res = await request(app)
      .delete(`/api/communications/drafts/${draft._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);

    const remaining = await EmailDraft.findById(draft._id);
    expect(remaining).toBeNull();
  });
});
