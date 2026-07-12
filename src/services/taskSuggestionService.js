const Anthropic = require("@anthropic-ai/sdk");

// GET /api/events/:id/suggested-tasks used to always return the same
// three hardcoded strings (day-of setup, RSVP follow-up, thank-you/
// debrief) for every event, regardless of what the event actually is —
// a kids pizza party and a leadership summit got identical suggestions.
// This asks the model to propose a short list of tasks actually
// tailored to this event's real content, reusing the same
// tool-use-for-structured-output pattern generationService.js already
// uses for finalize_caption.
const SUGGEST_TASKS_TOOL = {
  name: "suggest_tasks",
  description:
    "Propose a short list of concrete, specific follow-up tasks for this event — not a generic checklist that would apply to any event.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "A short, specific, actionable task title naming this actual event.",
            },
            description: {
              type: "string",
              description: "One short sentence of concrete detail — not a restatement of the title.",
            },
            due_date_offset_days: {
              type: "integer",
              description:
                "Days relative to the event's start date/time — negative for before the event (e.g. -7 for a week before), 0 for the day of, positive for after (e.g. 2 for two days after).",
            },
          },
          required: ["title", "due_date_offset_days"],
        },
      },
    },
    required: ["tasks"],
  },
};

const buildPrompt = ({ event, flyer, ministry }) => {
  const c = flyer?.content || {};
  const lines = [
    `Ministry: ${ministry?.name || "this ministry"}`,
    `Event: "${event.title}"`,
    event.description && `Event description: ${event.description}`,
    event.location && `Location: ${event.location}`,
    `Event start: ${event.start.toISOString()}`,
    event.end && `Event end: ${event.end.toISOString()}`,
    c.audience && `Audience: ${c.audience}`,
    c.cost && `Cost: ${c.cost}`,
    c.theme_tags?.length && `Themes: ${c.theme_tags.join(", ")}`,
    c.highlights?.length && `Highlights: ${c.highlights.join("; ")}`,
    c.rsvp_by && `RSVP by: ${c.rsvp_by}`,
  ].filter(Boolean);

  return `A ministry team member just approved this event onto their calendar. Propose 2-5 concrete, specific follow-up tasks a real team would actually need for THIS event — grounded in what kind of event it actually is (a kids' pizza party needs different day-of tasks than a leadership summit or a prayer night), not a generic template that would fit any event. Do not invent facts (speakers, vendors, specific numbers) beyond what's given below. Never assign a specific person — no assignee is chosen here, a human picks that afterward. Keep each task to ordinary day-to-day ministry operations (setup, follow-up, communication, debrief) — not project-management scaffolding like subtasks or checklists.

${lines.join("\n")}`;
};

// Best-effort, tailored task suggestions for a newly-approved event.
// Throws on any failure (missing API key, rate limit, malformed
// response) — callers are expected to catch and fall back to a safe
// static default rather than blocking the approval flow on this.
const suggestTasksForEvent = async ({ event, flyer, ministry }) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [SUGGEST_TASKS_TOOL],
    tool_choice: { type: "tool", name: "suggest_tasks" },
    messages: [{ role: "user", content: buildPrompt({ event, flyer, ministry }) }],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "suggest_tasks",
  );
  const tasks = toolUse?.input?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("Model did not return any suggested tasks");
  }

  return tasks.map((t) => ({
    title: t.title,
    description: t.description || undefined,
    due_date: new Date(event.start.getTime() + (t.due_date_offset_days || 0) * 24 * 60 * 60 * 1000),
  }));
};

module.exports = { suggestTasksForEvent };
