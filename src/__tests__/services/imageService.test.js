const mockGenerateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: mockGenerateContent,
    })),
  })),
}));

process.env.GEMINI_API_KEY = "test-key";

const { extractFlyerDetails } = require("../../services/imageService");

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
