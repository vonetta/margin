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

  it("mentions incorporating a reference photo when a host is present", () => {
    const prompt = buildFullFlyerPrompt({
      branding: {},
      content: { title: "Worship Intensive" },
      host: { name: "Apostle Khy" },
      speakers: [],
    });
    expect(prompt).toContain("Apostle Khy");
    expect(prompt).toContain("reference photo");
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

  it("propagates a failure from the image model instead of silently returning a blank flyer", async () => {
    mockGenerateFullFlyer.mockRejectedValue(new Error("No image returned from Gemini"));

    await expect(
      generateAiFlyer({ branding: {}, content: { title: "Worship Intensive" } }),
    ).rejects.toThrow("No image returned from Gemini");
  });
});
