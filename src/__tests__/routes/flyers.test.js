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

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Flyer = require("../../models/Flyer");
const Person = require("../../models/Person");
const User = require("../../models/User");
const Background = require("../../models/Background");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "KTM Test",
  plan: "enterprise",
  branding: { colors: { primary: "#03293F" } },
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
  await User.deleteMany({
    email: { $in: ["flyer-admin@ktm.com", "flyer-team@ktm.com"] },
  });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Flyer.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await Background.deleteMany({ ministry_id: "ktm-test" });
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
  const t = await request(app)
    .post("/api/auth/register")
    .send({
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
    expect(res.body.length).toBe(4);
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
