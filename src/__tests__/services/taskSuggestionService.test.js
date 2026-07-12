const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

process.env.ANTHROPIC_API_KEY = "test-key";

const { suggestTasksForEvent } = require("../../services/taskSuggestionService");

const toolResult = (tasks) => ({
  content: [{ type: "tool_use", name: "suggest_tasks", input: { tasks } }],
});

describe("suggestTasksForEvent", () => {
  beforeEach(() => mockCreate.mockReset());

  it("converts due_date_offset_days into real dates anchored to the event's start", async () => {
    mockCreate.mockResolvedValue(
      toolResult([
        { title: "Order pizza", description: "Confirm the order with the vendor.", due_date_offset_days: -3 },
        { title: "Set up game tables", due_date_offset_days: 0 },
        { title: "Send thank-you note", due_date_offset_days: 2 },
      ]),
    );

    const event = {
      title: "Pizza Party",
      start: new Date("2026-07-18T17:00:00Z"),
      end: new Date("2026-07-18T20:00:00Z"),
    };

    const result = await suggestTasksForEvent({ event, flyer: null, ministry: { name: "KTM" } });

    expect(result).toEqual([
      { title: "Order pizza", description: "Confirm the order with the vendor.", due_date: new Date("2026-07-15T17:00:00Z") },
      { title: "Set up game tables", description: undefined, due_date: new Date("2026-07-18T17:00:00Z") },
      { title: "Send thank-you note", description: undefined, due_date: new Date("2026-07-20T17:00:00Z") },
    ]);
  });

  it("includes flyer content (audience, cost, highlights) in the prompt when a flyer is linked", async () => {
    mockCreate.mockResolvedValue(toolResult([{ title: "Anything", due_date_offset_days: 0 }]));

    const event = { title: "Pizza Party", start: new Date("2026-07-18T17:00:00Z") };
    const flyer = {
      content: {
        audience: "Kids ages 7-14",
        cost: "$5",
        theme_tags: ["fun", "community"],
        highlights: ["Free pizza", "Games"],
        rsvp_by: "Friday, July 17, 2026",
      },
    };

    await suggestTasksForEvent({ event, flyer, ministry: { name: "KTM" } });

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Kids ages 7-14");
    expect(prompt).toContain("$5");
    expect(prompt).toContain("Free pizza; Games");
    expect(prompt).toContain("Friday, July 17, 2026");
  });

  it("throws when the model returns no tasks, so the caller can fall back", async () => {
    mockCreate.mockResolvedValue(toolResult([]));

    const event = { title: "Pizza Party", start: new Date("2026-07-18T17:00:00Z") };

    await expect(suggestTasksForEvent({ event, flyer: null, ministry: {} })).rejects.toThrow();
  });

  it("throws when the model call itself fails", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));

    const event = { title: "Pizza Party", start: new Date("2026-07-18T17:00:00Z") };

    await expect(suggestTasksForEvent({ event, flyer: null, ministry: {} })).rejects.toThrow("rate limited");
  });
});
