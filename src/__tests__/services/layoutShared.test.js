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
