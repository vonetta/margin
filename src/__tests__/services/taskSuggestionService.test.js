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

  describe("suggested_assignee (history-based hint, never a pre-fill)", () => {
    const event = { title: "Pizza Party", start: new Date("2026-07-18T17:00:00Z") };
    const activeMembers = [
      { id: "u1", name: "Sarah" },
      { id: "u2", name: "Marcus" },
    ];
    const pastTasks = [
      { title: "Order pizza for youth night", assigned_to: "u1" },
      { title: "Order pizza for game night", assigned_to: "u1" },
      { title: "Order snacks for movie night", assigned_to: "u1" },
    ];

    it("passes a candidate enum + real history to the model, and attaches a validated suggestion to the returned task", async () => {
      mockCreate.mockResolvedValue(
        toolResult([
          { title: "Order pizza", due_date_offset_days: -2, suggested_assignee_id: "u1", suggested_assignee_reason: "Did the last 3 similar orders" },
        ]),
      );

      const result = await suggestTasksForEvent({ event, flyer: null, ministry: { name: "KTM" }, pastTasks, activeMembers });

      expect(result[0].suggested_assignee).toEqual({
        user_id: "u1",
        name: "Sarah",
        reason: "Did the last 3 similar orders",
      });

      const toolSchema = mockCreate.mock.calls[0][0].tools[0].input_schema.properties.tasks.items.properties;
      expect(toolSchema.suggested_assignee_id.enum).toEqual(["u1", "u2"]);
      const prompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain("Order pizza for youth night");
      expect(prompt).toContain("Sarah");
    });

    it("drops the suggestion (does not throw, does not surface it) when the model returns an id outside the real candidate list", async () => {
      mockCreate.mockResolvedValue(
        toolResult([{ title: "Order pizza", due_date_offset_days: 0, suggested_assignee_id: "not-a-real-user-id" }]),
      );

      const result = await suggestTasksForEvent({ event, flyer: null, ministry: {}, pastTasks, activeMembers });

      expect(result[0].suggested_assignee).toBeUndefined();
    });

    it("never offers the assignee tool fields at all when history is below the minimum-evidence threshold", async () => {
      mockCreate.mockResolvedValue(toolResult([{ title: "Anything", due_date_offset_days: 0 }]));

      await suggestTasksForEvent({
        event,
        flyer: null,
        ministry: {},
        pastTasks: [{ title: "One-off task", assigned_to: "u1" }], // only 1, below MIN_HISTORY_FOR_SUGGESTION
        activeMembers,
      });

      const toolSchema = mockCreate.mock.calls[0][0].tools[0].input_schema.properties.tasks.items.properties;
      expect(toolSchema.suggested_assignee_id).toBeUndefined();
      const prompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).not.toContain("Past task assignments");
    });

    it("counts a shared (group_id) task's fanned-out rows as one vote, not one per assignee row", async () => {
      mockCreate.mockResolvedValue(toolResult([{ title: "Anything", due_date_offset_days: 0 }]));

      await suggestTasksForEvent({
        event,
        flyer: null,
        ministry: {},
        pastTasks: [
          { title: "Setup", assigned_to: "u1", group_id: "g1" },
          { title: "Setup", assigned_to: "u2", group_id: "g1" },
          { title: "Setup", assigned_to: "u1", group_id: "g1" }, // same group again — should not double count
        ],
        activeMembers,
      });

      // Below MIN_HISTORY_FOR_SUGGESTION (3) once deduped to 1 real row,
      // so this proves dedup happened via the same "no suggestion
      // offered" signal used above.
      const toolSchema = mockCreate.mock.calls[0][0].tools[0].input_schema.properties.tasks.items.properties;
      expect(toolSchema.suggested_assignee_id).toBeUndefined();
    });

    it("excludes a past assignee who is no longer an active member of this ministry", async () => {
      mockCreate.mockResolvedValue(toolResult([{ title: "Anything", due_date_offset_days: 0 }]));

      await suggestTasksForEvent({
        event,
        flyer: null,
        ministry: {},
        pastTasks: [
          { title: "Task 1", assigned_to: "u1" },
          { title: "Task 2", assigned_to: "left-the-ministry" },
          { title: "Task 3", assigned_to: "left-the-ministry" },
        ],
        activeMembers, // does not include "left-the-ministry"
      });

      const prompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).not.toContain("left-the-ministry");
    });
  });
});
