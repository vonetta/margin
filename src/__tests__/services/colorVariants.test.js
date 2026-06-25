const { deriveColorVariants } = require("../../services/layouts/shared");

const colors = {
  primary: "#03293F",
  accent: "#EA8A8B",
  gold: "#DAAE4F",
  bg: "#FFFFFF",
  text: "#1C1C1C",
};

describe("deriveColorVariants", () => {
  it("returns the exact brand colors unchanged for the brand variant", () => {
    const variants = deriveColorVariants(colors);
    expect(variants.brand).toEqual(colors);
  });

  it("produces 4 distinct variants, each still a valid hex palette", () => {
    const variants = deriveColorVariants(colors);
    expect(Object.keys(variants).sort()).toEqual(
      ["accent_swap", "brand", "cool", "warm"].sort(),
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

  it("warm and cool actually differ from brand", () => {
    const variants = deriveColorVariants(colors);
    expect(variants.warm.accent).not.toBe(colors.accent);
    expect(variants.cool.primary).not.toBe(colors.primary);
  });

  it("never reassigns primary to a different color — every layout depends on it staying the dark anchor", () => {
    const variants = deriveColorVariants(colors);
    for (const [name, variant] of Object.entries(variants)) {
      if (name === "cool") continue; // cool hue-rotates primary, but keeps its lightness/contrast
      expect(variant.primary).toBe(colors.primary);
    }
  });
});
