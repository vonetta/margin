const {
  selectTypography,
  inferTone,
  resolveTone,
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

  // The Pizza Night bug: a ministry's own tone_keywords vocab skews
  // formal (no ministry ever thinks to type "pizza" during onboarding),
  // so casual event copy matched nothing and silently fell back to the
  // formal default look. The keyword-matching pass is now merged with a
  // built-in baseline that extends whichever of the ministry's OWN
  // category names also appears in that baseline — never inventing a
  // category the ministry doesn't already have.
  it("infers energetic for a casual pizza night, via the merged default vocabulary", () => {
    expect(inferTone("Pizza Night", ktmTypeSystem.tone_keywords)).toBe("energetic");
  });

  it("still returns null for text that matches nothing, even with the merged defaults", () => {
    expect(
      inferTone("Some generic event text", ktmTypeSystem.tone_keywords),
    ).toBeNull();
  });

  it("never introduces a tone category the ministry hasn't defined itself", () => {
    // "casual"/"playful"/"fun" are default-vocab bucket names, but this
    // ministry only defines formal/warm/energetic — the merge must never
    // surface a category name they never typed in.
    const tone = inferTone("Pizza Night board game trivia", ktmTypeSystem.tone_keywords);
    expect(["formal", "warm", "energetic"]).toContain(tone);
  });
});

describe("resolveTone", () => {
  it("exact-matches the AI's proposal against a ministry's own category name", () => {
    expect(resolveTone("warm", ktmTypeSystem.tone_keywords)).toBe("warm");
  });

  it("is case-insensitive", () => {
    expect(resolveTone("WARM", ktmTypeSystem.tone_keywords)).toBe("warm");
  });

  it("maps a synonym to a ministry-defined equivalent category, rather than returning null", () => {
    // The ministry has no "playful" category itself, but "playful" is a
    // known synonym of both "warm" and "energetic", which it does have —
    // among its own matching categories, the first one it defined wins
    // (formal, then warm, then energetic — warm comes first here).
    expect(resolveTone("playful", ktmTypeSystem.tone_keywords)).toBe("warm");
  });

  it("prefers whichever of the ministry's own matching categories was defined first", () => {
    const reordered = { energetic: ["youth"], warm: ["retreat"] };
    expect(resolveTone("playful", reordered)).toBe("energetic");
  });

  it("returns null when nothing reasonably matches, rather than guessing", () => {
    expect(resolveTone("melancholy", ktmTypeSystem.tone_keywords)).toBeNull();
  });

  it("returns null for empty/missing input", () => {
    expect(resolveTone("", ktmTypeSystem.tone_keywords)).toBeNull();
    expect(resolveTone(null, ktmTypeSystem.tone_keywords)).toBeNull();
    expect(resolveTone(undefined, ktmTypeSystem.tone_keywords)).toBeNull();
  });

  it("returns null when the ministry has no tone_keywords at all", () => {
    expect(resolveTone("warm", {})).toBeNull();
    expect(resolveTone("warm", undefined)).toBeNull();
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

  it("selects an energetic look for Pizza Night via the merged default vocabulary", () => {
    const result = selectTypography(ktmTypeSystem, "Pizza Night");
    expect(result.tone).toBe("energetic");
    expect(result.display.name).toBe("Montserrat");
  });

  it("uses resolvedTone as-is when provided, skipping keyword inference entirely", () => {
    // Text says "Ordination" (would keyword-infer "formal"), but an
    // explicitly resolved tone always wins — one source of truth per call.
    const result = selectTypography(ktmTypeSystem, "Ordination Intensive", "energetic");
    expect(result.tone).toBe("energetic");
    expect(result.display.name).toBe("Montserrat");
  });

  it("treats a resolvedTone of null as explicitly no tone, not 'run inference'", () => {
    const result = selectTypography(ktmTypeSystem, "Ordination Intensive", null);
    expect(result.tone).toBeNull();
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
