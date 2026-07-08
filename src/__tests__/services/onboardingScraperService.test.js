const mockSafeFetch = jest.fn();
jest.mock("../../services/urlSafetyService", () => {
  const actual = jest.requireActual("../../services/urlSafetyService");
  return { ...actual, safeFetch: (...a) => mockSafeFetch(...a) };
});

const mockGenerateContent = jest.fn();
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: mockGenerateContent }),
  })),
}));

process.env.GEMINI_API_KEY = "test-key";

const { buildProfileFromWebsite } = require("../../services/onboardingScraperService");
const { UrlSafetyError } = require("../../services/urlSafetyService");

const geminiReturns = (obj) =>
  mockGenerateContent.mockResolvedValue({
    response: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] },
  });

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockGenerateContent.mockReset();
});

describe("buildProfileFromWebsite", () => {
  it("returns a normalized draft from scraped text + the model's JSON", async () => {
    mockSafeFetch.mockResolvedValue({
      finalUrl: "https://grace.org/",
      contentType: "text/html",
      body:
        '<title>Grace</title><meta name="theme-color" content="#2b4a7a"><body>' +
        "We are a Spirit-led family called to equip believers for the work of the ministry. " +
        "Every week we gather to worship, to grow in the Word, and to serve our city with the love of Christ. " +
        "Whether you are exploring faith for the first time or have walked with Jesus for decades, there is a place for you here." +
        "</body>",
    });
    geminiReturns({
      persona_name: "Grace Fellowship",
      tagline: "Equipping believers for the work of the ministry",
      tone_pillars: ["warm", "equipping", "spirit-led", "extra-that-should-be-cut"],
      sample_phrases: ["We are a Spirit-led family"],
      avoid: ["corporate jargon"],
      suggested_colors: { primary: "#2b4a7a", accent: "#d4a017" },
      brand_hashtags: ["#GraceFellowship"],
      content_hashtags: ["#Equipping", "#Discipleship"],
    });

    const draft = await buildProfileFromWebsite({ websiteUrl: "https://grace.org" });

    expect(draft.voice_profile.persona_name).toBe("Grace Fellowship");
    expect(draft.voice_profile.tone_pillars).toHaveLength(3); // capped at 3
    expect(draft.suggested_colors.primary).toBe("#2b4a7a");
    expect(draft.hashtags.brand).toEqual(["#GraceFellowship"]);
    expect(draft.source.url).toBe("https://grace.org/");
    expect(draft.source.had_readable_text).toBe(true);
  });

  it("falls back to the page's declared theme-color when the model gives no primary", async () => {
    mockSafeFetch.mockResolvedValue({
      finalUrl: "https://x.org/",
      contentType: "text/html; charset=utf-8",
      body: '<meta name="theme-color" content="#123456"><body>hello there friends</body>',
    });
    geminiReturns({ persona_name: null, suggested_colors: { primary: null, accent: null } });

    const draft = await buildProfileFromWebsite({ websiteUrl: "https://x.org" });
    expect(draft.suggested_colors.primary).toBe("#123456");
  });

  it("tolerates the model wrapping its JSON in markdown fences", async () => {
    mockSafeFetch.mockResolvedValue({ finalUrl: "https://x.org/", contentType: "text/html", body: "<body>hi</body>" });
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: '```json\n{"persona_name":"X"}\n```' }] } }],
      },
    });
    const draft = await buildProfileFromWebsite({ websiteUrl: "https://x.org" });
    expect(draft.voice_profile.persona_name).toBe("X");
  });

  it("rejects a URL that returns a non-HTML content type (never calls the model)", async () => {
    mockSafeFetch.mockResolvedValue({ finalUrl: "https://x.org/f.pdf", contentType: "application/pdf", body: "%PDF" });
    await expect(buildProfileFromWebsite({ websiteUrl: "https://x.org/f.pdf" })).rejects.toThrow(UrlSafetyError);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("requires a website URL", async () => {
    await expect(buildProfileFromWebsite({ websiteUrl: "" })).rejects.toThrow(UrlSafetyError);
  });

  it("propagates the SSRF guard's rejection (e.g. an internal URL)", async () => {
    mockSafeFetch.mockRejectedValue(new UrlSafetyError("That address isn't allowed"));
    await expect(buildProfileFromWebsite({ websiteUrl: "http://169.254.169.254" })).rejects.toThrow(
      "That address isn't allowed",
    );
  });
});
