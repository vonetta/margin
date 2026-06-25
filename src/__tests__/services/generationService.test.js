const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

process.env.ANTHROPIC_API_KEY = "test-key";

const { chatTurn } = require("../../services/generationService");
const { defaultStyle } = require("../../services/layouts/styleSchema");

const profile = {
  voice_profile: {
    persona_name: "Apostle Khy",
    sign_off: "Love and Blessings, Apostle Khy",
    tone_pillars: ["Apostolic weight"],
    sample_phrases: ["Secure your spot today"],
    avoid: ["em dashes"],
    registers: { formal: "Direct and instructional" },
  },
  hashtags: { brand: ["#KTM"], content: ["#Apostolic"] },
  ctas: { enrollment: "Secure your spot" },
  sops: [],
  templates: [],
  recurring_content: [],
};

const ministry = {
  ministry_id: "ktm",
  name: "Khy Traylor Global Ministries",
  entity_boundary: "Never mix KTM and Salt & Light content.",
};

describe("chatTurn", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns done:false with the question when the model asks for more info", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Is this a KTM event or a Salt & Light event?" },
      ],
    });

    const result = await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [{ role: "user", content: "We have an event next week" }],
    });

    expect(result).toEqual({
      done: false,
      message: "Is this a KTM event or a Salt & Light event?",
    });
  });

  it("returns done:true with the caption when the model calls finalize_caption", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "finalize_caption",
          input: { caption: "Final caption text" },
        },
      ],
    });

    const result = await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [
        { role: "user", content: "We have an event next week" },
        {
          role: "assistant",
          content: "Is this a KTM event or a Salt & Light event?",
        },
        { role: "user", content: "It's a KTM event" },
      ],
    });

    expect(result).toEqual({
      done: true,
      caption: "Final caption text",
      event: null,
      style: defaultStyle(),
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "finalize_caption" }),
        ]),
      }),
    );
  });

  it("includes structured event details when the model provides them", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "finalize_caption",
          input: {
            caption: "Final caption text",
            event: { title: "Worship Workshop", date: "July 20" },
          },
        },
      ],
    });

    const result = await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [{ role: "user", content: "Worship Workshop July 20" }],
    });

    expect(result).toEqual({
      done: true,
      caption: "Final caption text",
      event: { title: "Worship Workshop", date: "July 20" },
      style: defaultStyle(),
    });
  });

  it("includes a validated style object when the model proposes one", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "finalize_caption",
          input: {
            caption: "Final caption text",
            style: { title_size: 9999, description_visible: false },
          },
        },
      ],
    });

    const result = await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [{ role: "user", content: "Worship Workshop July 20" }],
    });

    expect(result.style.title_size).toBe(96);
    expect(result.style.description_visible).toBe(false);
    expect(result.style.subtitle_size).toBe(defaultStyle().subtitle_size);
  });

  it("does not offer switch_ministry when there are no sibling ministries", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "What's the date?" }],
    });

    await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [{ role: "user", content: "We have an event" }],
      availableMinistries: [{ ministry_id: "ktm", name: "KTM" }],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ name: "finalize_caption" })],
      }),
    );
  });

  it("offers switch_ministry when a sibling ministry is available", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "What's the date?" }],
    });

    await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [{ role: "user", content: "We have an event" }],
      availableMinistries: [
        { ministry_id: "ktm", name: "KTM" },
        { ministry_id: "salt-light", name: "Salt & Light" },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "switch_ministry" }),
        ]),
      }),
    );
  });

  it("returns switchTo when the model calls switch_ministry", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "switch_ministry",
          input: {
            ministry_id: "salt-light",
            note: "Got it — continuing this under Salt & Light.",
          },
        },
      ],
    });

    const result = await chatTurn({
      profile,
      ministry,
      platform: "Instagram",
      messages: [{ role: "user", content: "It's a Salt & Light event" }],
      availableMinistries: [
        { ministry_id: "ktm", name: "KTM" },
        { ministry_id: "salt-light", name: "Salt & Light" },
      ],
    });

    expect(result).toEqual({
      done: false,
      switchTo: {
        ministry_id: "salt-light",
        note: "Got it — continuing this under Salt & Light.",
      },
      message: "Got it — continuing this under Salt & Light.",
    });
  });
});
