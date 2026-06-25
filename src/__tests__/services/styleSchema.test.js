const { defaultStyle, validateStyle } = require("../../services/layouts/styleSchema");

describe("validateStyle", () => {
  it("returns all schema defaults when given nothing", () => {
    expect(validateStyle()).toEqual(defaultStyle());
    expect(validateStyle({})).toEqual(defaultStyle());
  });

  it("clamps numbers above the max", () => {
    const result = validateStyle({ title_size: 9999 });
    expect(result.title_size).toBe(96);
  });

  it("clamps numbers below the min", () => {
    const result = validateStyle({ title_size: -50 });
    expect(result.title_size).toBe(40);
  });

  it("keeps valid in-range numbers as-is", () => {
    const result = validateStyle({ title_size: 80 });
    expect(result.title_size).toBe(80);
  });

  it("coerces non-numeric values to the default", () => {
    const result = validateStyle({ title_size: "not a number" });
    expect(result.title_size).toBe(defaultStyle().title_size);
  });

  it("coerces booleans", () => {
    expect(validateStyle({ description_visible: false }).description_visible).toBe(
      false,
    );
    expect(validateStyle({ tags_visible: 0 }).tags_visible).toBe(false);
    expect(validateStyle({ tags_visible: "yes" }).tags_visible).toBe(true);
  });

  it("drops unknown keys", () => {
    const result = validateStyle({ made_up_property: 12345 });
    expect(result).not.toHaveProperty("made_up_property");
  });

  it("always returns every schema key, even if only one was proposed", () => {
    const result = validateStyle({ title_size: 80 });
    expect(Object.keys(result).sort()).toEqual(
      Object.keys(defaultStyle()).sort(),
    );
  });
});
