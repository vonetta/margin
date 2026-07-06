const mockCreate = jest.fn();
const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue();

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

const {
  parseTranscriptText,
  extractTasksFromTranscript,
  matchAssignee,
  extractPdfText,
} = require("../../services/meetingTaskService");

describe("parseTranscriptText", () => {
  it("strips WEBVTT headers, cue indices, and timestamp lines", () => {
    const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
Apostle Khy: Let's start with the conference planning.

2
00:00:05.000 --> 00:00:10.000
Mesha: I can take the flyer design.`;

    const result = parseTranscriptText(vtt);
    expect(result).not.toContain("WEBVTT");
    expect(result).not.toContain("-->");
    expect(result).not.toMatch(/^\d+$/m);
    expect(result).toContain("Apostle Khy: Let's start with the conference planning.");
    expect(result).toContain("Mesha: I can take the flyer design.");
  });

  it("passes through plain (non-VTT) text unchanged", () => {
    const plain = "Apostle Khy: Let's start.\nMesha: Sounds good.";
    expect(parseTranscriptText(plain)).toBe(plain);
  });

  it("handles empty/nullish input", () => {
    expect(parseTranscriptText("")).toBe("");
    expect(parseTranscriptText(null)).toBe("");
  });
});

describe("matchAssignee", () => {
  const roster = [
    { _id: "u1", name: "Prophetess Mesha" },
    { _id: "u2", name: "Conita Reed" },
  ];

  it("matches an exact name", () => {
    expect(matchAssignee("Conita Reed", roster)).toEqual(roster[1]);
  });

  it("matches a partial name either direction", () => {
    expect(matchAssignee("Mesha", roster)).toEqual(roster[0]);
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(matchAssignee("Someone Else", roster)).toBeNull();
  });

  it("returns null for an empty/missing name", () => {
    expect(matchAssignee("", roster)).toBeNull();
    expect(matchAssignee(undefined, roster)).toBeNull();
  });
});

describe("extractTasksFromTranscript", () => {
  beforeEach(() => mockCreate.mockReset());

  const toolResponse = (tasks) => ({
    content: [{ type: "tool_use", name: "extract_tasks", input: { tasks } }],
  });

  it("returns the tasks extracted via tool use", async () => {
    mockCreate.mockResolvedValue(
      toolResponse([
        { description: "Design the conference flyer", assignee_name: "Prophetess Mesha" },
        { description: "Confirm the venue" },
      ]),
    );

    const tasks = await extractTasksFromTranscript("some transcript", [
      { _id: "u1", name: "Prophetess Mesha" },
    ]);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].assignee_name).toBe("Prophetess Mesha");
    expect(tasks[1].assignee_name).toBeUndefined();
  });

  it("includes the team roster names in the system prompt", async () => {
    mockCreate.mockResolvedValue(toolResponse([]));
    await extractTasksFromTranscript("transcript", [
      { _id: "u1", name: "Prophetess Mesha" },
      { _id: "u2", name: "Conita Reed" },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain("Prophetess Mesha");
    expect(callArgs.system).toContain("Conita Reed");
  });

  it("throws if the model doesn't return a tool_use block", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "I couldn't read this." }] });
    await expect(extractTasksFromTranscript("transcript", [])).rejects.toThrow(
      "No tasks could be extracted",
    );
  });

  it("requires a non-empty transcript", async () => {
    await expect(extractTasksFromTranscript("", [])).rejects.toThrow(
      "A transcript is required",
    );
  });

  it("does not mention related ministries in the prompt when there's no org family", async () => {
    mockCreate.mockResolvedValue(toolResponse([]));
    await extractTasksFromTranscript("transcript", [], null, [{ ministry_id: "ktm", name: "KTM" }]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).not.toContain("related ministry");
    expect(callArgs.tools[0].input_schema.properties.tasks.items.properties.ministry_name).toBeDefined();
  });

  it("tells the model about every related ministry when an org family is passed", async () => {
    mockCreate.mockResolvedValue(toolResponse([]));
    await extractTasksFromTranscript("transcript", [], null, [
      { ministry_id: "ktm", name: "KTM" },
      { ministry_id: "salt-light", name: "Salt & Light" },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain("KTM");
    expect(callArgs.system).toContain("Salt & Light");
  });

  it("returns ministry_name and ministry_uncertain when the model provides them", async () => {
    mockCreate.mockResolvedValue(
      toolResponse([
        { description: "Rent the van", ministry_name: "Salt & Light", ministry_uncertain: true },
      ]),
    );

    const tasks = await extractTasksFromTranscript("transcript", [], null, [
      { ministry_id: "ktm", name: "KTM" },
      { ministry_id: "salt-light", name: "Salt & Light" },
    ]);

    expect(tasks[0].ministry_name).toBe("Salt & Light");
    expect(tasks[0].ministry_uncertain).toBe(true);
  });
});

describe("extractPdfText", () => {
  beforeEach(() => {
    mockGetText.mockReset();
    mockDestroy.mockClear();
  });

  it("extracts plain text from a PDF buffer", async () => {
    mockGetText.mockResolvedValue({
      text: "Apostle Khy: Let's plan the conference. Mesha, can you handle the flyer?",
    });

    const result = await extractPdfText(Buffer.from("fake-pdf-bytes"));
    expect(result).toBe("Apostle Khy: Let's plan the conference. Mesha, can you handle the flyer?");
  });

  it("strips page-footer artifacts like '-- 1 of 1 --'", async () => {
    mockGetText.mockResolvedValue({
      text: "Some meeting content.\n\n-- 1 of 1 --\n\n",
    });

    const result = await extractPdfText(Buffer.from("fake-pdf-bytes"));
    expect(result).not.toContain("-- 1 of 1 --");
    expect(result).toBe("Some meeting content.");
  });

  it("always destroys the parser, even on failure", async () => {
    mockGetText.mockRejectedValue(new Error("corrupt PDF"));
    await expect(extractPdfText(Buffer.from("bad"))).rejects.toThrow("corrupt PDF");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
