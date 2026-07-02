const mockGenerateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: mockGenerateContent,
    })),
  })),
}));

process.env.GEMINI_API_KEY = "test-key";

const { extractFlyerDetails, draftSopFromImages } = require("../../services/imageService");

const textResponse = (text) => ({
  response: { candidates: [{ content: { parts: [{ text }] } }] },
});

describe("extractFlyerDetails", () => {
  beforeEach(() => mockGenerateContent.mockReset());

  it("parses raw JSON returned by the model", async () => {
    mockGenerateContent.mockResolvedValue(
      textResponse(
        '{"title":"Worship Workshop","subtitle":null,"date":"July 20","location":null,"cost":"$100","cta":"Secure your spot","registration_url":null,"other_details":null}',
      ),
    );

    const result = await extractFlyerDetails(
      Buffer.from("fake-image"),
      "image/png",
    );

    expect(result).toEqual({
      title: "Worship Workshop",
      subtitle: null,
      date: "July 20",
      location: null,
      cost: "$100",
      cta: "Secure your spot",
      registration_url: null,
      other_details: null,
    });
  });

  it("strips markdown code fences before parsing", async () => {
    mockGenerateContent.mockResolvedValue(
      textResponse('```json\n{"title":"Fenced Event"}\n```'),
    );

    const result = await extractFlyerDetails(Buffer.from("fake-image"));
    expect(result.title).toBe("Fenced Event");
  });

  it("throws if the model's response cannot be parsed as JSON", async () => {
    mockGenerateContent.mockResolvedValue(
      textResponse("Sorry, I can't read this image."),
    );

    await expect(
      extractFlyerDetails(Buffer.from("fake-image")),
    ).rejects.toThrow("Could not parse flyer details");
  });

  it("requires an image buffer", async () => {
    await expect(extractFlyerDetails(null)).rejects.toThrow(
      "An image buffer is required",
    );
  });
});

describe("draftSopFromImages", () => {
  beforeEach(() => mockGenerateContent.mockReset());

  it("parses a title/content SOP from the model's raw JSON", async () => {
    mockGenerateContent.mockResolvedValue(
      textResponse(
        '{"title":"Setting Up the Sanctuary","content":"1. Arrange chairs\\n2. Test sound"}',
      ),
    );

    const result = await draftSopFromImages(
      [{ buffer: Buffer.from("fake-image"), mimeType: "image/png" }],
      "these are photos of the setup process",
    );

    expect(result).toEqual({
      title: "Setting Up the Sanctuary",
      content: "1. Arrange chairs\n2. Test sound",
    });
  });

  it("strips markdown code fences before parsing", async () => {
    mockGenerateContent.mockResolvedValue(
      textResponse('```json\n{"title":"Fenced SOP","content":"Step one."}\n```'),
    );

    const result = await draftSopFromImages([
      { buffer: Buffer.from("fake-image"), mimeType: "image/png" },
    ]);
    expect(result.title).toBe("Fenced SOP");
  });

  it("throws if the model omits title or content", async () => {
    mockGenerateContent.mockResolvedValue(textResponse('{"title":"Only a title"}'));

    await expect(
      draftSopFromImages([{ buffer: Buffer.from("fake-image"), mimeType: "image/png" }]),
    ).rejects.toThrow("Could not parse an SOP");
  });

  it("throws if the model's response cannot be parsed as JSON", async () => {
    mockGenerateContent.mockResolvedValue(textResponse("I can't read these images."));

    await expect(
      draftSopFromImages([{ buffer: Buffer.from("fake-image"), mimeType: "image/png" }]),
    ).rejects.toThrow("Could not parse an SOP");
  });

  it("requires at least one image", async () => {
    await expect(draftSopFromImages([])).rejects.toThrow(
      "At least one image is required",
    );
    await expect(draftSopFromImages(null)).rejects.toThrow(
      "At least one image is required",
    );
  });
});
