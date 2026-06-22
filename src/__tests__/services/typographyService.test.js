const {
  selectTypography,
  inferTone,
} = require("../../services/typographyService");
const { buildGoogleFontsUrl } = require("../../services/fontLoader");

const ktmTypeSystem = {
  default_display: "Cinzel",
  default_body: "Montserrat",
  tone_keywords: {
    formal: [
      "ordination",
      "conference",
      "training",
      "intensive",
      "apostolic",
      "leadership",
    ],
    warm: ["retreat", "worship", "fellowship", "koinonia"],
    energetic: ["youth", "revival", "celebration", "night"],
  },
  fonts: [
    {
      name: "Cinzel",
      roles: ["display"],
      tones: ["formal", "classic"],
      weights: ["400", "600"],
    },
    {
      name: "Cormorant Garamond",
      roles: ["display"],
      tones: ["warm", "classic"],
      weights: ["400"],
    },
    {
      name: "Montserrat",
      roles: ["body", "display"],
      tones: ["formal", "warm", "energetic"],
      weights: ["400"],
    },
    {
      name: "Poppins",
      roles: ["display", "body"],
      tones: ["energetic", "modern"],
      weights: ["400"],
    },
    {
      name: "Great Vibes",
      roles: ["script", "accent"],
      tones: ["warm", "classic"],
      weights: ["400"],
    },
  ],
};

describe("inferTone", () => {
  it("infers formal for ordination content", () => {
    expect(inferTone("Ordination Intensive", ktmTypeSystem.tone_keywords)).toBe(
      "formal",
    );
  });

  it("infers warm for a worship retreat", () => {
    expect(
      inferTone(
        "Koinonia worship retreat and fellowship",
        ktmTypeSystem.tone_keywords,
      ),
    ).toBe("warm");
  });

  it("infers energetic for a youth night", () => {
    expect(
      inferTone("Youth revival night celebration", ktmTypeSystem.tone_keywords),
    ).toBe("energetic");
  });

  it("returns null when no keywords match", () => {
    expect(
      inferTone("Some generic event text", ktmTypeSystem.tone_keywords),
    ).toBeNull();
  });

  it("returns null when no keywords are provided", () => {
    expect(inferTone("Ordination Intensive")).toBeNull();
  });
});

describe("selectTypography", () => {
  it("selects formal fonts for an ordination event", () => {
    const result = selectTypography(
      ktmTypeSystem,
      "Ordination Training Intensive",
    );
    expect(result.tone).toBe("formal");
    expect(result.display.name).toBe("Cinzel");
    expect(result.fonts_used.length).toBeLessThanOrEqual(3);
  });

  it("selects warmer fonts for a retreat", () => {
    const result = selectTypography(
      ktmTypeSystem,
      "Koinonia Retreat fellowship",
    );
    expect(result.tone).toBe("warm");
    expect(result.display.name).toBe("Cormorant Garamond");
  });

  it("never returns more than 3 fonts", () => {
    const result = selectTypography(ktmTypeSystem, "worship retreat gathering");
    expect(result.fonts_used.length).toBeLessThanOrEqual(3);
  });

  it("falls back to safe defaults when type system is empty", () => {
    const result = selectTypography(null, "Any event");
    expect(result.display.name).toBe("Georgia");
    expect(result.body.name).toBe("Helvetica");
  });
});

describe("buildGoogleFontsUrl", () => {
  it("builds a valid Google Fonts URL", () => {
    const url = buildGoogleFontsUrl(ktmTypeSystem.fonts);
    expect(url).toContain("https://fonts.googleapis.com/css2?");
    expect(url).toContain("family=Cinzel");
    expect(url).toContain("family=Cormorant+Garamond");
    expect(url).toContain("display=swap");
  });

  it("returns null for an empty font list", () => {
    expect(buildGoogleFontsUrl([])).toBeNull();
  });
});
