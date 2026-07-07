const { resolveDimensions } = require("../../services/layouts/shared");

describe("resolveDimensions", () => {
  it("returns Instagram's 4:5 feed dimensions for the social size", () => {
    expect(resolveDimensions("social", "Instagram")).toEqual({
      width: 1080,
      height: 1350,
    });
  });

  it("returns a square for Facebook", () => {
    expect(resolveDimensions("social", "Facebook")).toEqual({
      width: 1200,
      height: 1200,
    });
  });

  it("returns a square for a quote card", () => {
    expect(resolveDimensions("social", "Quote card")).toEqual({
      width: 1080,
      height: 1080,
    });
  });

  it("returns a wide banner for email", () => {
    expect(resolveDimensions("social", "Email")).toEqual({
      width: 1200,
      height: 628,
    });
  });

  it("falls back to the generic social default for an unrecognized platform", () => {
    expect(resolveDimensions("social", "Carrier Pigeon")).toEqual({
      width: 1080,
      height: 1350,
    });
  });

  it("falls back to the generic social default when no platform is given", () => {
    expect(resolveDimensions("social")).toEqual({ width: 1080, height: 1350 });
  });

  it("ignores platform for print — print dimensions don't vary by platform", () => {
    expect(resolveDimensions("print", "Facebook")).toEqual({
      width: 1275,
      height: 1650,
    });
  });
});

const {
  contrastRatio,
  ensureContrastOn,
  gradientTextStyle,
} = require("../../services/layouts/shared");

describe("ensureContrastOn", () => {
  it("leaves a color alone when it already clears the ratio", () => {
    expect(ensureContrastOn("#03293F", "#ffffff", 3)).toBe("#03293F");
  });

  it("darkens a too-light color on a light background until it clears 3:1", () => {
    // KTM's real palette: salmon accent on blush-pink background — the
    // exact production case that rendered near-invisible subtitle text.
    const fixed = ensureContrastOn("#EA8A8B", "#F0C7C3", 3);
    expect(contrastRatio(fixed, "#F0C7C3")).toBeGreaterThanOrEqual(3);
  });

  it("lightens a too-dark color on a dark background", () => {
    const fixed = ensureContrastOn("#333344", "#1a1a2e", 3);
    expect(contrastRatio(fixed, "#1a1a2e")).toBeGreaterThanOrEqual(3);
  });

  it("passes nullish input through untouched", () => {
    expect(ensureContrastOn(null, "#ffffff")).toBeNull();
    expect(ensureContrastOn("#000000", null)).toBe("#000000");
  });
});

describe("gradientTextStyle contrast correction", () => {
  it("keeps the raw brand stops when no bg is provided (legacy behavior)", () => {
    const css = gradientTextStyle({ gold: "#DAAE4F", accent: "#EA8A8B" });
    expect(css).toContain("#DAAE4F");
    expect(css).toContain("#EA8A8B");
  });

  it("replaces unreadable stops when bg is provided", () => {
    const css = gradientTextStyle({ gold: "#DAAE4F", accent: "#EA8A8B", bg: "#F0C7C3" });
    expect(css).not.toContain("#DAAE4F");
    expect(css).not.toContain("#EA8A8B");
  });
});
