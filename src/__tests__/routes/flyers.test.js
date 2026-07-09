const mockGenerateFlyer = jest.fn().mockResolvedValue({
  png: Buffer.from("fake-flyer-png"),
  meta: { layout: "monument", tone: "formal", background_id: "bg1" },
});
jest.mock("../../services/flyerService", () => ({
  generateFlyer: (...args) => mockGenerateFlyer(...args),
}));

jest.mock("../../services/storageService", () => ({
  uploadFile: jest.fn().mockResolvedValue({
    key: "ktm-test/flyers/f-abc.png",
    url: "https://pub-test.r2.dev/ktm-test/flyers/f-abc.png",
  }),
  deleteFile: jest.fn().mockResolvedValue({ deleted: true }),
  safeDeleteFile: jest.fn().mockResolvedValue({ deleted: true }),
}));

const mockGenerateBackground = jest
  .fn()
  .mockResolvedValue(Buffer.from("fake-bg-png"));
jest.mock("../../services/imageService", () => ({
  generateBackground: (...args) => mockGenerateBackground(...args),
}));

const mockGenerateAiFlyer = jest.fn().mockResolvedValue({
  png: Buffer.from("fake-ai-flyer-png"),
  meta: { engine: "ai", tone: null, has_qr: false, reference_image_count: 0 },
});
jest.mock("../../services/aiFlyerService", () => ({
  generateAiFlyer: (...args) => mockGenerateAiFlyer(...args),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const { registerMember } = require("../../testHelpers/register");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Flyer = require("../../models/Flyer");
const Person = require("../../models/Person");
const User = require("../../models/User");
const Background = require("../../models/Background");
const Event = require("../../models/Event");
const Notification = require("../../models/Notification");
const AiProfile = require("../../models/AiProfile");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "KTM Test",
  plan: "enterprise",
  branding: { colors: { primary: "#03293F" } },
  onboarding_complete: true,
};

let adminToken, teamToken;

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Flyer.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await Background.deleteMany({ ministry_id: "ktm-test" });
  await Event.deleteMany({ ministry_id: "ktm-test" });
  await Notification.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["flyer-admin@ktm.com", "flyer-team@ktm.com"] },
  });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Flyer.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await Background.deleteMany({ ministry_id: "ktm-test" });
  await Event.deleteMany({ ministry_id: "ktm-test" });
  await Notification.deleteMany({ ministry_id: "ktm-test" });
  await AiProfile.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["flyer-admin@ktm.com", "flyer-team@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const a = await request(app)
    .post("/api/auth/register")
    .send({
      email: "flyer-admin@ktm.com",
      password: "Password123",
      name: "A",
      ministry_id: "ktm-test",
      role: "admin",
    });
  adminToken = a.body.token;
  const t = await registerMember(app, {
      email: "flyer-team@ktm.com",
      password: "Password123",
      name: "T",
      ministry_id: "ktm-test",
      role: "team",
    });
  teamToken = t.body.token;
});

describe("GET /api/flyers/layouts", () => {
  it("returns the layout gallery", async () => {
    const res = await request(app)
      .get("/api/flyers/layouts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);
    expect(res.body[0]).toHaveProperty("name");
  });
});

describe("POST /api/flyers/generate", () => {
  it("generates and saves a flyer", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prophetic Training Workshop",
        date: "June 12-14",
        qr_url: "https://x.com",
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Prophetic Training Workshop");
    expect(res.body.social_url).toContain("r2.dev");
    expect(res.body.print_url).toContain("r2.dev");
    expect(res.body.layout).toBe("monument");
  });

  it("saves description, theme_tags, and audience on the flyer record", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prophetic Training Workshop",
        description: "Step into the supernatural.",
        theme_tags: ["Teaching", "Impartation"],
        audience: "Leaders and prophetic voices",
      });

    expect(res.status).toBe(201);
    expect(res.body.content.description).toBe("Step into the supernatural.");
    expect(res.body.content.theme_tags).toEqual(["Teaching", "Impartation"]);
    expect(res.body.content.audience).toBe("Leaders and prophetic voices");
  });

  it("passes a tone through as resolvedTone when it matches one of the ministry's own categories", async () => {
    await AiProfile.create({
      ministry_id: "ktm-test",
      type_system: { tone_keywords: { formal: ["conference"], energetic: ["night"] } },
    });
    mockGenerateFlyer.mockClear();

    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Pizza Night", tone: "energetic" });

    expect(res.status).toBe(201);
    const callArgs = mockGenerateFlyer.mock.calls[0][0];
    expect(callArgs.resolvedTone).toBe("energetic");
  });

  it("clamps an unrecognized tone to undefined-turned-null, never inventing a category", async () => {
    await AiProfile.create({
      ministry_id: "ktm-test",
      type_system: { tone_keywords: { formal: ["conference"] } },
    });
    mockGenerateFlyer.mockClear();

    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Pizza Night", tone: "some-made-up-tone" });

    expect(res.status).toBe(201);
    const callArgs = mockGenerateFlyer.mock.calls[0][0];
    expect(callArgs.resolvedTone).toBeNull();
  });

  it("omits resolvedTone entirely when no tone was sent, so keyword inference still runs", async () => {
    mockGenerateFlyer.mockClear();

    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Pizza Night" });

    expect(res.status).toBe(201);
    const callArgs = mockGenerateFlyer.mock.calls[0][0];
    expect(callArgs.resolvedTone).toBeUndefined();
  });

  it("threads typeSystem and the resolved tone through to the AI Studio engine too, not just the template engine", async () => {
    await AiProfile.create({
      ministry_id: "ktm-test",
      type_system: { tone_keywords: { formal: ["conference"], energetic: ["night"] } },
    });
    mockGenerateAiFlyer.mockClear();

    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Pizza Night", tone: "energetic", engine: "ai" });

    expect(res.status).toBe(201);
    const callArgs = mockGenerateAiFlyer.mock.calls[0][0];
    expect(callArgs.resolvedTone).toBe("energetic");
    expect(callArgs.typeSystem).toEqual(
      expect.objectContaining({ tone_keywords: expect.anything() }),
    );
  });

  it("auto-creates a pending calendar event when the date parses", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Worship Intensive",
        date: "August 15, 2026, 10AM - 4PM",
        location: "1234 Los Angeles, CA",
      });

    expect(res.status).toBe(201);
    const event = await Event.findOne({ ministry_id: "ktm-test", flyer_id: res.body._id });
    expect(event).toBeTruthy();
    expect(event.status).toBe("pending");
    expect(event.source).toBe("flyer");
    expect(event.title).toBe("Worship Intensive");
  });

  it("notifies the ministry's admin about the pending calendar event", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Worship Intensive",
        date: "August 15, 2026, 10AM - 4PM",
      });

    expect(res.status).toBe(201);
    const notifications = await Notification.find({ ministry_id: "ktm-test", type: "event_pending_approval" });
    expect(notifications.length).toBe(1);
    expect(notifications[0].body).toBe("Worship Intensive");
  });

  it("doesn't create a calendar event when the date doesn't parse, and doesn't fail the flyer", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "No Date Flyer" });

    expect(res.status).toBe(201);
    const event = await Event.findOne({ ministry_id: "ktm-test", flyer_id: res.body._id });
    expect(event).toBeNull();
  });

  it("clamps an out-of-range style value before passing it to the renderer", async () => {
    mockGenerateFlyer.mockClear();

    await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prophetic Training Workshop",
        style: { title_size: 99999, description_visible: false },
      });

    expect(mockGenerateFlyer).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          title_size: 96,
          description_visible: false,
        }),
      }),
    );
  });

  it("forwards an accepted background_url straight to the renderer, bypassing auto-selection", async () => {
    mockGenerateFlyer.mockClear();

    await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Prophetic Training Workshop",
        background_url: "https://pub-test.r2.dev/ktm-test/backgrounds/literal-abc.png",
      });

    expect(mockGenerateFlyer).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundUrl: "https://pub-test.r2.dev/ktm-test/backgrounds/literal-abc.png",
      }),
    );
  });

  it("rejects a non-array theme_tags", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Should fail", theme_tags: "not an array" });

    expect(res.status).toBe(400);
  });

  it("rejects generation by a team member", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ title: "Should fail" });
    expect(res.status).toBe(403);
  });

  it("rejects a flyer with no title", async () => {
    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "June 12" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/flyers/infer-tone", () => {
  it("suggests a tone plus the ministry's own category options, with no AI call", async () => {
    await AiProfile.create({
      ministry_id: "ktm-test",
      type_system: {
        tone_keywords: { formal: ["conference"], energetic: ["youth", "night"] },
      },
    });

    const res = await request(app)
      .post("/api/flyers/infer-tone")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Pizza Night" });

    expect(res.status).toBe(200);
    expect(res.body.tone).toBe("energetic");
    expect(res.body.options.sort()).toEqual(["energetic", "formal"]);
    expect(mockGenerateBackground).not.toHaveBeenCalled();
  });

  it("returns options with a null tone when nothing matches", async () => {
    await AiProfile.create({
      ministry_id: "ktm-test",
      type_system: { tone_keywords: { formal: ["conference"] } },
    });

    const res = await request(app)
      .post("/api/flyers/infer-tone")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Just a regular gathering" });

    expect(res.status).toBe(200);
    expect(res.body.tone).toBeNull();
    expect(res.body.options).toEqual(["formal"]);
  });

  it("returns empty options for a ministry with no type system yet", async () => {
    const res = await request(app)
      .post("/api/flyers/infer-tone")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Anything" });

    expect(res.status).toBe(200);
    expect(res.body.tone).toBeNull();
    expect(res.body.options).toEqual([]);
  });

  it("is available to a team member (read-only, no role gate)", async () => {
    const res = await request(app)
      .post("/api/flyers/infer-tone")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ title: "Anything" });
    expect(res.status).toBe(200);
  });
});

describe("plan limits on POST /api/flyers/generate", () => {
  afterEach(async () => {
    await Ministry.deleteMany({ ministry_id: "flyer-cap-test" });
    await Flyer.deleteMany({ ministry_id: "flyer-cap-test" });
    await User.deleteMany({ email: "flyer-cap-admin@ktm.com" });
    await Event.deleteMany({ ministry_id: "flyer-cap-test" });
    await Notification.deleteMany({ ministry_id: "flyer-cap-test" });
  });

  it("blocks generating a 16th flyer in a month on the small plan (cap 15)", async () => {
    await Ministry.create({ ministry_id: "flyer-cap-test", name: "Flyer Cap Test", plan: "small", onboarding_complete: true });
    const admin = await request(app).post("/api/auth/register").send({
      email: "flyer-cap-admin@ktm.com",
      password: "Password123",
      name: "Admin",
      ministry_id: "flyer-cap-test",
      role: "admin",
    });
    const token = admin.body.token;

    await Flyer.insertMany(
      Array.from({ length: 15 }, (_, i) => ({
        ministry_id: "flyer-cap-test",
        title: `Backfilled Flyer ${i}`,
        layout: "monument",
        created_at: new Date(),
      })),
    );

    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "flyer-cap-test")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "One Too Many" });
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("small plan allows up to 15 flyers per month");
  });

  it("does not count flyers created in a prior month toward the cap", async () => {
    await Ministry.create({ ministry_id: "flyer-cap-test", name: "Flyer Cap Test", plan: "small", onboarding_complete: true });
    const admin = await request(app).post("/api/auth/register").send({
      email: "flyer-cap-admin@ktm.com",
      password: "Password123",
      name: "Admin",
      ministry_id: "flyer-cap-test",
      role: "admin",
    });
    const token = admin.body.token;

    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    await Flyer.insertMany(
      Array.from({ length: 15 }, (_, i) => ({
        ministry_id: "flyer-cap-test",
        title: `Last Month Flyer ${i}`,
        layout: "monument",
        created_at: lastMonth,
      })),
    );

    const res = await request(app)
      .post("/api/flyers/generate")
      .set("x-ministry-id", "flyer-cap-test")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Fresh Month" });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/flyers/background-preview", () => {
  it("generates and stores one candidate image without attaching it to a flyer", async () => {
    const res = await request(app)
      .post("/api/flyers/background-preview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ topic_hint: "Worship, Equipping" });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe(
      "https://pub-test.r2.dev/ktm-test/flyers/f-abc.png",
    );
    expect(mockGenerateBackground).toHaveBeenCalledWith(
      expect.stringContaining("Worship, Equipping"),
    );

    const stored = await Background.findById(res.body._id);
    expect(stored).toBeTruthy();
  });

  it("rejects a team member (requires admin/leader)", async () => {
    const res = await request(app)
      .post("/api/flyers/background-preview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("GET /api/flyers", () => {
  it("returns flyer history", async () => {
    await Flyer.create({
      ministry_id: "ktm-test",
      title: "F1",
      layout: "monument",
    });
    const res = await request(app)
      .get("/api/flyers")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
