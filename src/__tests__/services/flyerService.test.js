jest.mock("../../services/flyerRenderer", () => ({
  renderHtmlToPng: jest.fn().mockResolvedValue(Buffer.from("fake-png")),
}));

const { generateFlyer } = require("../../services/flyerService");
const { renderHtmlToPng } = require("../../services/flyerRenderer");

describe("generateFlyer dimensions", () => {
  beforeEach(() => renderHtmlToPng.mockClear());

  it("uses Instagram's 4:5 dimensions when platform is Instagram", async () => {
    const result = await generateFlyer({
      content: { title: "Test" },
      platform: "Instagram",
      autoBackground: false,
    });

    expect(result.meta.dimensions).toEqual({ width: 1080, height: 1350 });
    expect(renderHtmlToPng).toHaveBeenCalledWith(
      expect.any(String),
      1080,
      1350,
    );
  });

  it("uses Facebook's square dimensions when platform is Facebook", async () => {
    const result = await generateFlyer({
      content: { title: "Test" },
      platform: "Facebook",
      autoBackground: false,
    });

    expect(result.meta.dimensions).toEqual({ width: 1200, height: 1200 });
    expect(renderHtmlToPng).toHaveBeenCalledWith(
      expect.any(String),
      1200,
      1200,
    );
  });

  it("falls back to the generic social size when no platform is given", async () => {
    const result = await generateFlyer({
      content: { title: "Test" },
      autoBackground: false,
    });

    expect(result.meta.dimensions).toEqual({ width: 1080, height: 1350 });
  });

  it("ignores platform for the print size", async () => {
    const result = await generateFlyer({
      content: { title: "Test" },
      platform: "Facebook",
      size: "print",
      autoBackground: false,
    });

    expect(result.meta.dimensions).toEqual({ width: 1275, height: 1650 });
  });
});
