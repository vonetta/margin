jest.mock("../../services/imageService", () => ({
  generateBackground: jest.fn().mockResolvedValue(Buffer.from("new-bg-png")),
}));

jest.mock("../../services/storageService", () => ({
  uploadFile: jest.fn().mockResolvedValue({
    key: "ktm-test/backgrounds/auto-abc.png",
    url: "https://pub-test.r2.dev/ktm-test/backgrounds/auto-abc.png",
  }),
}));

require("dotenv").config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});
const { connectTestDB } = require("../../testHelpers/db");
const { selectBackground } = require("../../services/backgroundSelector");
const Background = require("../../models/Background");
const Ministry = require("../../models/Ministry");

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Background.deleteMany({ ministry_id: "ktm-test" });
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
});

beforeEach(async () => {
  await Background.deleteMany({ ministry_id: "ktm-test" });
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Ministry.create({
    ministry_id: "ktm-test",
    name: "KTM Test",
    plan: "enterprise",
    branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
  });
});

describe("selectBackground", () => {
  it("reuses an existing tone-matched background", async () => {
    await Background.create({
      ministry_id: "ktm-test",
      prompt: "p",
      url: "https://existing.r2.dev/bg.png",
      key: "k",
      tone: "formal",
    });

    const result = await selectBackground({
      ministryId: "ktm-test",
      layout: "monument",
      tone: "formal",
    });
    expect(result.generated).toBe(false);
    expect(result.url).toBe("https://existing.r2.dev/bg.png");
  });

  it("generates and stores a new background when the library is empty", async () => {
    const result = await selectBackground({
      ministryId: "ktm-test",
      layout: "showcase",
      tone: "formal",
      topicHint: "Worship, Equipping",
    });
    expect(result.generated).toBe(true);
    expect(result.url).toBe(
      "https://pub-test.r2.dev/ktm-test/backgrounds/auto-abc.png",
    );
    expect(result.id).toBeTruthy();

    const stored = await Background.findById(result.id);
    expect(stored).toBeTruthy();
    expect(stored.tone).toBe("formal");
    expect(stored.prompt).toContain("Worship, Equipping");
  });

  it("falls back to the gradient when generation fails", async () => {
    const { generateBackground } = require("../../services/imageService");
    generateBackground.mockRejectedValueOnce(new Error("quota exceeded"));

    const result = await selectBackground({
      ministryId: "ktm-test",
      layout: "showcase",
      tone: "formal",
    });
    expect(result.generated).toBe(false);
    expect(result.url).toBeNull();
    expect(result.id).toBeNull();
  });

  it("generates a fresh background rather than borrowing an unrelated tone's, when a tone was resolved", async () => {
    // A formal-conference backdrop must never get inherited by a
    // "casual"-toned flyer just because it's the most recent thing in
    // the library — that's the exact bug a Pizza Night flyer hit.
    await Background.create({
      ministry_id: "ktm-test",
      prompt: "p",
      url: "https://any.r2.dev/bg.png",
      key: "k",
      tone: "warm",
    });

    const result = await selectBackground({
      ministryId: "ktm-test",
      layout: "monument",
      tone: "formal",
    });
    expect(result.generated).toBe(true);
    expect(result.url).not.toBe("https://any.r2.dev/bg.png");

    const stored = await Background.findById(result.id);
    expect(stored.tone).toBe("formal");
  });

  it("falls back to the most recent background only when no tone signal exists at all", async () => {
    await Background.create({
      ministry_id: "ktm-test",
      prompt: "p",
      url: "https://any.r2.dev/bg.png",
      key: "k",
      tone: "warm",
    });

    const result = await selectBackground({
      ministryId: "ktm-test",
      layout: "monument",
      tone: null,
    });
    expect(result.generated).toBe(false);
    expect(result.url).toBe("https://any.r2.dev/bg.png");
  });
});
