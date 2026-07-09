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

  // The model doesn't literally copy reference pixels — it re-draws its
  // own interpretation, and re-drawn small text (a multi-word wordmark)
  // is exactly where these models introduce typos. So the logo is never
  // sent as an "reproduce exactly" image reference; instead the prompt
  // reserves blank space for the real file to be composited in afterward
  // (see the aiFlyerService.test.js generateAiFlyer describe block for
  // the actual overlayLogo compositing coverage).
  it("reserves blank top-center space for the logo instead of asking the model to draw it, when a logo exists", () => {
    const prompt = buildFullFlyerPrompt({
      branding: { name: "KTM", logo_url: "https://example.com/logo.png" },
      content: { title: "Worship Intensive" },
    });
    expect(prompt).not.toContain("OFFICIAL LOGO");
    expect(prompt).toContain("horizontal strip completely blank across the FULL WIDTH");
    expect(prompt).toContain("composited there afterward");
    expect(prompt).toContain("light, neutral, low-contrast backdrop");
    expect(prompt).not.toContain("called KTM");
  });

  it("says nothing about reserving logo space when the ministry has no logo", () => {
    const prompt = buildFullFlyerPrompt({
      branding: { name: "KTM" },
      content: { title: "Worship Intensive" },
    });
    expect(prompt).not.toContain("horizontal strip completely blank across the FULL WIDTH");
    expect(prompt).toContain("called KTM");
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

  describe("logo compositing (never trusts the model to draw the real logo)", () => {
    const fakeLogoPng = () =>
      sharp({
        create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

    it("composites the real logo onto the flyer, distinct from a flyer with no logo", async () => {
      const basePng = await fakePng();
      mockGenerateFullFlyer.mockResolvedValue(basePng);
      const logoBuffer = await fakeLogoPng();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => logoBuffer.buffer.slice(logoBuffer.byteOffset, logoBuffer.byteOffset + logoBuffer.byteLength),
        headers: { get: () => "image/png" },
      });

      const result = await generateAiFlyer({
        branding: { logo_url: "https://example.com/logo.png", colors: {} },
        content: { title: "Worship Intensive" },
      });

      expect(result.meta.has_logo).toBe(true);
      expect(result.png.equals(basePng)).toBe(false);
      const meta = await sharp(result.png).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
    });

    // The real bug this guards against: the model doesn't reliably honor
    // the prompt's "leave this area blank" instruction — one real
    // generation drew a title headline straight through the reserved
    // logo area, and the logo (pasted directly, with no backing) landed
    // right on top of it in an illegible collision. The fix is an opaque
    // backing panel behind the logo, mirroring overlayQr's existing
    // pattern, so coverage is guaranteed regardless of what the model
    // actually drew underneath — not dependent on prompt compliance.
    it("fully covers whatever the model drew in the logo area, even when it ignored the blank-space instruction", async () => {
      // A base image that's NOT blank where the logo goes — busy content
      // (a bright color, standing in for a title the model drew there
      // anyway) fills the entire top-center region.
      const busyBase = await sharp({
        create: { width: 1080, height: 1350, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } },
      })
        .png()
        .toBuffer();
      mockGenerateFullFlyer.mockResolvedValue(busyBase);
      const logoBuffer = await fakeLogoPng();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => logoBuffer.buffer.slice(logoBuffer.byteOffset, logoBuffer.byteOffset + logoBuffer.byteLength),
        headers: { get: () => "image/png" },
      });

      const result = await generateAiFlyer({
        branding: { logo_url: "https://example.com/logo.png", colors: {} },
        content: { title: "Worship Intensive" },
      });

      // Sample a pixel from the center of where the logo panel lands —
      // it must be the panel's own opaque backing/logo color, not any
      // trace of the busy green the model "drew" underneath.
      const { data, info } = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
      const logoWidth = Math.round(1080 * 0.34);
      const topMargin = Math.round(1350 * 0.045);
      const sampleX = 540; // horizontal center, where the panel is centered
      const sampleY = topMargin + 10; // just inside the panel's top edge
      const idx = (sampleY * info.width + sampleX) * info.channels;
      const [r, g, b] = [data[idx], data[idx + 1], data[idx + 2]];
      // The busy "model drew here anyway" stand-in is a distinct
      // (10, 200, 10) green — the panel (white backing or the red logo
      // itself) must not match it at all, proving full coverage.
      const matchesBusyBackground = r < 30 && g > 180 && b < 30;
      expect(matchesBusyBackground).toBe(false);
    });

    it("does not composite anything, and reports has_logo: false, when the ministry has no logo", async () => {
      const basePng = await fakePng();
      mockGenerateFullFlyer.mockResolvedValue(basePng);

      const result = await generateAiFlyer({
        branding: { colors: {} },
        content: { title: "Worship Intensive" },
      });

      expect(result.meta.has_logo).toBe(false);
      expect(result.png.equals(basePng)).toBe(true);
    });

    it("skips the overlay gracefully (doesn't fail the flyer) when the logo fetch fails", async () => {
      const basePng = await fakePng();
      mockGenerateFullFlyer.mockResolvedValue(basePng);
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await generateAiFlyer({
        branding: { logo_url: "https://example.com/logo.png", colors: {} },
        content: { title: "Worship Intensive" },
      });

      expect(result.meta.has_logo).toBe(true);
      expect(result.png.equals(basePng)).toBe(true);
    });
  });
});
