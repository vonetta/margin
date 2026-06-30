const { deriveColorVariants } = require("../../services/layouts/shared");

const colors = {
  primary: "#03293F",
  accent: "#EA8A8B",
  gold: "#DAAE4F",
  bg: "#FFFFFF",
  text: "#1C1C1C",
};

const hexToHue = (hex) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let hue;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / d + 2) * 60;
  else hue = ((r - g) / d + 4) * 60;
  return hue;
};

const hueDiff = (a, b) => {
  const d = Math.abs(hexToHue(a) - hexToHue(b)) % 360;
  return Math.min(d, 360 - d);
};

describe("deriveColorVariants", () => {
  it("returns the exact brand colors unchanged for the brand variant", () => {
    const variants = deriveColorVariants(colors);
    expect(variants.brand).toEqual(colors);
  });

  it("produces 4 distinct variants, each still a valid hex palette", () => {
    const variants = deriveColorVariants(colors);
    expect(Object.keys(variants).sort()).toEqual(
      ["accent_swap", "brand", "complementary", "triad"].sort(),
    );
    for (const variant of Object.values(variants)) {
      expect(variant.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(variant.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(variant.gold).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("accent_swap reassigns the same three colors rather than inventing new ones", () => {
    const variants = deriveColorVariants(colors);
    const usedColors = [
      variants.accent_swap.primary,
      variants.accent_swap.accent,
      variants.accent_swap.gold,
    ].sort();
    expect(usedColors).toEqual([colors.primary, colors.accent, colors.gold].sort());
  });

  it("never reassigns primary — every layout depends on it staying the dark anchor", () => {
    const variants = deriveColorVariants(colors);
    for (const variant of Object.values(variants)) {
      expect(variant.primary).toBe(colors.primary);
    }
  });

  it("triad's accent and gold land roughly 120 degrees apart from primary's hue", () => {
    const variants = deriveColorVariants(colors);
    const primaryHue = hexToHue(colors.primary);
    const accentHue = hexToHue(variants.triad.accent);
    const goldHue = hexToHue(variants.triad.gold);
    expect(Math.abs(((accentHue - primaryHue + 360) % 360) - 120)).toBeLessThan(5);
    expect(Math.abs(((goldHue - primaryHue + 360) % 360) - 240)).toBeLessThan(5);
  });

  it("triad and complementary are visibly distinct from brand and from each other", () => {
    const variants = deriveColorVariants(colors);
    expect(hueDiff(variants.triad.accent, colors.accent)).toBeGreaterThan(15);
    expect(hueDiff(variants.complementary.accent, colors.accent)).toBeGreaterThan(15);
    expect(hueDiff(variants.triad.accent, variants.complementary.accent)).toBeGreaterThan(15);
  });

  it("derived colors keep the original accent/gold's own saturation and lightness, not primary's", () => {
    // A muddy, low-saturation derived color (inheriting primary's tone)
    // would defeat the point — triad/complementary should stay as vivid
    // as the ministry's real accent/gold.
    const darkMutedPrimary = { ...colors, primary: "#1a1a1a" };
    const variants = deriveColorVariants(darkMutedPrimary);
    expect(variants.triad.accent.toLowerCase()).not.toBe("#1a1a1a");
  });
});
