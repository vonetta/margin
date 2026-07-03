const Anthropic = require("@anthropic-ai/sdk");

// Zoom's cloud-recording transcript export is WebVTT: a "WEBVTT" header,
// then repeating blocks of a cue index, a timestamp line, and the spoken
// text. Strip everything but the spoken text. If it's not VTT (a plain
// pasted transcript), pass it through unchanged rather than mangling it.
const parseTranscriptText = (raw) => {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!/^WEBVTT/i.test(trimmed)) return trimmed;

  return trimmed
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^WEBVTT/i.test(t)) return false;
      if (/^\d+$/.test(t)) return false; // cue index
      if (/-->/.test(t)) return false; // timestamp line
      return true;
    })
    .join("\n");
};

const EXTRACT_TASKS_TOOL = {
  name: "extract_tasks",
  description:
    "Submit the concrete action items found in this meeting transcript, so they can be turned into real tasks after a human reviews them.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "A clear, actionable task description — what needs to be done.",
            },
            assignee_name: {
              type: "string",
              description:
                "The exact name (from the provided team roster) of whoever this was assigned to in the transcript. Omit entirely if no specific person was named.",
            },
            due_date: {
              type: "string",
              description:
                "An ISO 8601 date (YYYY-MM-DD) only if a specific date or unambiguous timeframe was actually mentioned (e.g. 'by Friday' relative to the meeting date). Omit otherwise — never invent one.",
            },
          },
          required: ["description"],
        },
      },
    },
    required: ["tasks"],
  },
};

// Reads a meeting transcript and pulls out real action items — never
// invents one that wasn't actually discussed. Only text generation is
// needed here (no images), unlike the SOP-from-images path, so this goes
// through Claude rather than Gemini.
const extractTasksFromTranscript = async (transcript, teamRoster = [], meetingDate = null) => {
  if (!transcript || !transcript.trim()) {
    throw new Error("A transcript is required to extract tasks");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const rosterNames = teamRoster.map((m) => m.name).join(", ") || "(no roster provided)";
  const dateContext = meetingDate ? `This meeting took place on ${meetingDate}.` : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You read meeting transcripts for a ministry leadership team and extract concrete action items — real things someone was asked to do, discussed as a next step, or committed to. Only extract action items that were actually discussed; do not invent tasks or pad the list to seem thorough. ${dateContext}

The team roster for this ministry is: ${rosterNames}. When the transcript identifies who something was assigned to, use their exact name as written in this roster (not however they were referred to in casual speech) so it can be matched automatically. If no specific person was named for an item, omit assignee_name entirely rather than guessing.`,
    tools: [EXTRACT_TASKS_TOOL],
    tool_choice: { type: "tool", name: "extract_tasks" },
    messages: [{ role: "user", content: transcript }],
  });

  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === "extract_tasks",
  );
  if (!toolUse) {
    throw new Error("No tasks could be extracted from this transcript");
  }
  return toolUse.input.tasks || [];
};

// Matches an AI-read name against the ministry's real team roster —
// exact match first, then a loose substring match either direction (e.g.
// "Mesha" said in conversation vs. "Prophetess Mesha" as the full name on
// record). Returns null rather than guessing when nothing lines up, so an
// unmatched task is visibly unmatched for a human to resolve instead of
// silently attached to the wrong person.
const matchAssignee = (assigneeName, teamRoster = []) => {
  if (!assigneeName) return null;
  const norm = (s) => s.toLowerCase().trim();
  const target = norm(assigneeName);

  const exact = teamRoster.find((m) => norm(m.name) === target);
  if (exact) return exact;

  const partial = teamRoster.find(
    (m) => norm(m.name).includes(target) || target.includes(norm(m.name)),
  );
  return partial || null;
};

module.exports = { parseTranscriptText, extractTasksFromTranscript, matchAssignee };
