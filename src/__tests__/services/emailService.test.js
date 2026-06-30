const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

process.env.ANTHROPIC_API_KEY = "test-key";

const { emailChatTurn, buildEmailSystemPrompt } = require("../../services/emailService");

const profile = {
  voice_profile: {
    persona_name: "Apostle Khy",
    sign_off: "Love and Blessings, Apostle Khy",
    tone_pillars: ["Apostolic weight"],
    sample_phrases: ["Secure your spot today"],
    avoid: ["em dashes", "corporate jargon"],
  },
  sops: [
    { title: "Conference SOP", content: "Doors open 30 minutes early." },
  ],
};

const ministry = { ministry_id: "ktm", name: "Khy Traylor Global Ministries" };

describe("buildEmailSystemPrompt", () => {
  it("includes the recipient name, email type guidance, and voice rules", () => {
    const prompt = buildEmailSystemPrompt(profile, ministry, "confirmation", "Dr. Robert Rush III");
    expect(prompt).toContain("Dr. Robert Rush III");
    expect(prompt).toContain("confirmation memo");
    expect(prompt).toContain("Love and Blessings, Apostle Khy");
    expect(prompt).toContain("em dashes, corporate jargon");
    expect(prompt).toContain("Doors open 30 minutes early.");
  });

  it("never invents facts", () => {
    const prompt = buildEmailSystemPrompt(profile, ministry, "invitation", "Someone");
    expect(prompt).toContain("Never invent a fact");
  });
});

describe("emailChatTurn", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns done:false with the question when the model asks for more info", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "What's the honorarium amount?" }],
    });

    const result = await emailChatTurn({
      profile,
      ministry,
      emailType: "confirmation",
      recipientName: "Dr. Robert Rush III",
      messages: [{ role: "user", content: "Confirming his slot" }],
    });

    expect(result).toEqual({
      done: false,
      message: "What's the honorarium amount?",
    });
  });

  it("returns done:true with subject and body when the model calls finalize_email", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "finalize_email",
          input: {
            subject: "Confirming Your Ministry Assignment",
            body: "Dear Dr. Robert,\n\nGreetings...",
          },
        },
      ],
    });

    const result = await emailChatTurn({
      profile,
      ministry,
      emailType: "confirmation",
      recipientName: "Dr. Robert Rush III",
      messages: [{ role: "user", content: "Friday June 12, 7pm, $850" }],
    });

    expect(result).toEqual({
      done: true,
      subject: "Confirming Your Ministry Assignment",
      body: "Dear Dr. Robert,\n\nGreetings...",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "finalize_email" }),
        ]),
      }),
    );
  });
});
