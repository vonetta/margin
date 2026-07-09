const mockGenerateFullFlyer = jest.fn();

jest.mock("../../services/imageService", () => ({
  generateFullFlyer: (...args) => mockGenerateFullFlyer(...args),
}));

const sharp = require("sharp");
const { generateAiFlyer, buildFullFlyerPrompt } = require("../../services/aiFlyerService");

const fakePng = async (width = 1080, height = 1350) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();

describe("buildFullFlyerPrompt", () => {
  it("includes exact event text and brand colors", () => {
    const prompt = buildFullFlyerPrompt({
      branding: { name: "KTM", colors: { primary: "#03293F", gold: "#DAAE4F" } },
      content: { title: "Worship Intensive", date: "August 15", cost: "Free" },
      speakers: [],
    });
    expect(prompt).toContain('Title: "Worship Intensive"');
    expect(prompt).toContain('Date: "August 15"');
    expect(prompt).toContain("#03293F");
    expect(prompt).toContain("#DAAE4F");
  });

  it("mentions incorporating a reference photo when a host reference image is present", () => {
    const prompt = buildFullFlyerPrompt({
      branding: {},
      content: { title: "Worship Intensive" },
      referenceImages: [{ role: "host", name: "Apostle Khy" }],
    });
    expect(prompt).toContain("Apostle Khy");
    expect(prompt).toContain("real photo");
  });

  it("instructs the model to reproduce an attached logo exactly, not invent one", () => {
    const prompt = buildFullFlyerPrompt({
      branding: {},
      content: { title: "Worship Intensive" },
      referenceImages: [{ role: "logo", name: null }],
    });
    expect(prompt).toContain("OFFICIAL LOGO");
    expect(prompt).toContain("do not redesign");
  });

  it("tells the model not to leave large empty dead space", () => {
    const prompt = buildFullFlyerPrompt({
      branding: {},
      content: { title: "Worship Intensive" },
      referenceImages: [],
    });
    expect(prompt).toContain("no large empty single-color areas");
  });

  // The bug this exists to fix: a casual event ("Pizza Party") rendered
  // with the same gala/elegant-serif design direction as a formal
  // conference — the AI-image path never received any tone signal at
  // all before this, unlike the deterministic template engine.
  const typeSystem = {
    tone_keywords: { formal: ["ordination", "conference"], energetic: ["youth", "night"] },
    fonts: [
      { name: "Cinzel", roles: ["display"], tones: ["formal", "classic"] },
      { name: "Montserrat", roles: ["body", "display"], tones: ["formal", "warm", "energetic"] },
    ],
  };
  const branding = {
    name: "KTM",
    colors: { primary: "#03293F", gold: "#DAAE4F" },
    fonts: { heading: "Cinzel", body: "Montserrat" },
  };

  it("keeps today's gala/elegant direction and the ministry's default font for a formal tone", () => {
    const prompt = buildFullFlyerPrompt({
      branding,
      content: { title: "Ordination Service" },
      typeSystem,
      tone: "formal",
    });
    expect(prompt).toContain("Typography feel: Cinzel headlines");
    expect(prompt).toContain("gala or church-event invitation");
  });

  it("keeps today's default direction when no tone is resolved at all", () => {
    const prompt = buildFullFlyerPrompt({
      branding,
      content: { title: "Some Event" },
      typeSystem,
      tone: null,
    });
    expect(prompt).toContain("gala or church-event invitation");
  });

  it("switches to a bold, casual direction and typography for an energetic tone", () => {
    const prompt = buildFullFlyerPrompt({
      branding,
      content: { title: "Pizza Party" },
      typeSystem,
      tone: "energetic",
    });
    expect(prompt).not.toContain("gala or church-event invitation");
    expect(prompt).not.toContain("Cinzel");
    expect(prompt).toContain("bold, energetic, modern event-flyer design");
    expect(prompt).toContain("nothing that reads formal or ornate");
  });

  it("switches to a warm direction for a warm tone", () => {
    const prompt = buildFullFlyerPrompt({
      branding,
      content: { title: "Family Fellowship Picnic" },
      typeSystem,
      tone: "warm",
    });
    expect(prompt).toContain("warm, inviting, relational event-flyer design");
  });

  it("falls back to the ministry's default branding font when there's no typeSystem at all", () => {
    const prompt = buildFullFlyerPrompt({
      branding,
      content: { title: "Some Event" },
      tone: null,
    });
    expect(prompt).toContain("Typography feel: Cinzel headlines, clean Montserrat body text.");
  });
});

describe("generateAiFlyer", () => {
  beforeEach(() => {
    mockGenerateFullFlyer.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, // no reference images fetched in these tests
    });
  });

  it("returns a PNG and engine metadata without a QR code when no qrUrl is given", async () => {
    mockGenerateFullFlyer.mockResolvedValue(await fakePng());

    const result = await generateAiFlyer({
      branding: { colors: { primary: "#03293F" } },
      content: { title: "Worship Intensive" },
      size: "social",
    });

    expect(result.png).toBeInstanceOf(Buffer);
    expect(result.meta).toEqual(
      expect.objectContaining({ engine: "ai", size: "social", has_qr: false }),
    );
  });

  it("composites a real QR code onto the generated image when qrUrl is given", async () => {
    const basePng = await fakePng();
    mockGenerateFullFlyer.mockResolvedValue(basePng);

    const result = await generateAiFlyer({
      branding: { colors: { primary: "#03293F" } },
      content: { title: "Worship Intensive" },
      qrUrl: "https://example.com/rsvp",
      size: "social",
    });

    expect(result.meta.has_qr).toBe(true);
    // Compositing should not shrink the canvas and should produce a
    // different (larger, since PNG now encodes QR detail) buffer than the
    // untouched base image.
    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(result.png.equals(basePng)).toBe(false);
  });

  it("positions the QR against the image's actual dimensions, not an assumed canvas size", async () => {
    // The model doesn't reliably return the exact pixel size implied by
    // the requested aspect ratio — this is smaller than the assumed
    // 1080x1350 "social" canvas, reproducing the real bug where the QR
    // landed partly outside the actual image.
    const basePng = await fakePng(896, 1152);
    mockGenerateFullFlyer.mockResolvedValue(basePng);

    const result = await generateAiFlyer({
      branding: { colors: { primary: "#03293F" } },
      content: { title: "Worship Intensive" },
      qrUrl: "https://example.com/rsvp",
      size: "social",
    });

    const meta = await sharp(result.png).metadata();
    // Compositing must not resize the canvas to the assumed size.
    expect(meta.width).toBe(896);
    expect(meta.height).toBe(1152);
  });

  it("propagates a failure from the image model instead of silently returning a blank flyer", async () => {
    mockGenerateFullFlyer.mockRejectedValue(new Error("No image returned from Gemini"));

    await expect(
      generateAiFlyer({ branding: {}, content: { title: "Worship Intensive" } }),
    ).rejects.toThrow("No image returned from Gemini");
  });

  describe("tone resolution", () => {
    const typeSystem = {
      tone_keywords: { formal: ["ordination"], energetic: ["youth", "night", "pizza"] },
    };

    beforeEach(() => {
      mockGenerateFullFlyer.mockImplementation(() => fakePng());
    });

    it("uses resolvedTone directly when provided, skipping keyword inference", async () => {
      const result = await generateAiFlyer({
        branding: {},
        content: { title: "Ordination Service" }, // would keyword-infer "formal"
        typeSystem,
        resolvedTone: "energetic",
      });
      expect(result.meta.tone).toBe("energetic");
      expect(mockGenerateFullFlyer.mock.calls[0][0]).toContain("nothing that reads formal or ornate");
    });

    it("falls back to keyword inference when resolvedTone is omitted (manual-entry path)", async () => {
      const result = await generateAiFlyer({
        branding: {},
        content: { title: "Pizza Night" },
        typeSystem,
      });
      expect(result.meta.tone).toBe("energetic");
    });

    it("treats resolvedTone: null as explicitly no tone, not 'run inference'", async () => {
      const result = await generateAiFlyer({
        branding: {},
        content: { title: "Pizza Night" }, // would keyword-infer "energetic"
        typeSystem,
        resolvedTone: null,
      });
      expect(result.meta.tone).toBeNull();
      expect(mockGenerateFullFlyer.mock.calls[0][0]).toContain("gala or church-event invitation");
    });
  });
});
