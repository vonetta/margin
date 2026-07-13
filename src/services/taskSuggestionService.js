const Anthropic = require("@anthropic-ai/sdk");

// GET /api/events/:id/suggested-tasks used to always return the same
// three hardcoded strings (day-of setup, RSVP follow-up, thank-you/
// debrief) for every event, regardless of what the event actually is —
// a kids pizza party and a leadership summit got identical suggestions.
// This asks the model to propose a short list of tasks actually
// tailored to this event's real content, reusing the same
// tool-use-for-structured-output pattern generationService.js already
// uses for finalize_caption.
//
// suggested_assignee is a genuinely optional hint, not a pre-fill — see
// buildAssigneeHint below and the frontend, which only ever shows it as
// inline text next to a still-blank dropdown. The model is asked to name
// a candidate ONLY when assignmentHistory actually shows a clear
// pattern; otherwise it must omit the field. Whatever it returns is
// still re-validated server-side (see suggestTasksForEvent) against the
// exact candidate list we gave it — Anthropic's tool-use `enum` is not a
// strict server-side guarantee, so this cannot be trusted on the schema
// constraint alone.
const SUGGEST_TASKS_TOOL = ({ candidateIds }) => ({
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
            ...(candidateIds.length
              ? {
                  suggested_assignee_id: {
                    type: "string",
                    enum: candidateIds,
                    description:
                      "ONLY set this when the assignment history below shows a genuinely clear, repeated pattern for a task like this one — must be exactly one of the candidate ids provided, never a name or anything else. Omit this field entirely (do not guess) when the history is thin, mixed, or doesn't clearly apply to this specific task.",
                  },
                  suggested_assignee_reason: {
                    type: "string",
                    description:
                      "Only present alongside suggested_assignee_id — one short factual sentence citing the actual pattern (e.g. \"Did 4 of the last 5 similar tasks\"). Never invent a reason not grounded in the history given.",
                  },
                }
              : {}),
          },
          required: ["title", "due_date_offset_days"],
        },
      },
    },
    required: ["tasks"],
  },
});

const buildPrompt = ({ event, flyer, ministry, assignmentHistory }) => {
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

  const historySection = assignmentHistory?.length
    ? `\n\nPast task assignments in this ministry (title -> who did it), for spotting a genuine pattern only:\n${assignmentHistory
        .map((h) => `- "${h.title}" -> ${h.assignee_name} (id: ${h.assignee_id})`)
        .join("\n")}`
    : "";

  return `A ministry team member just approved this event onto their calendar. Propose 2-5 concrete, specific follow-up tasks a real team would actually need for THIS event — grounded in what kind of event it actually is (a kids' pizza party needs different day-of tasks than a leadership summit or a prayer night), not a generic template that would fit any event. Do not invent facts (speakers, vendors, specific numbers) beyond what's given below. Keep each task to ordinary day-to-day ministry operations (setup, follow-up, communication, debrief) — not project-management scaffolding like subtasks or checklists.

${lines.join("\n")}${historySection}`;
};

// Dedupes shared (group_id) task rows down to one vote each — several
// Task documents sharing a group_id are the SAME assignment fanned out
// per-person (see Task.js), not independent evidence, and only counts a
// past assignment when that assignee is still an active member of this
// ministry today (a volunteer who did 5 tasks last year but has since
// left shouldn't get suggested for a new one). Capped and returned as
// plain {title, assignee_id, assignee_name} rows for the prompt — no
// history at all (empty array) is treated as "not enough evidence" by
// the caller, which skips the assignee-suggestion feature entirely
// rather than asking the model to guess from nothing.
const MIN_HISTORY_FOR_SUGGESTION = 3;
const MAX_HISTORY_ROWS = 50;

const buildAssignmentHistory = (pastTasks, activeMembersById) => {
  const seenGroupIds = new Set();
  const rows = [];
  for (const t of pastTasks) {
    if (t.group_id) {
      if (seenGroupIds.has(t.group_id)) continue;
      seenGroupIds.add(t.group_id);
    }
    const member = activeMembersById.get(String(t.assigned_to));
    if (!member) continue;
    rows.push({ title: t.title, assignee_id: member.id, assignee_name: member.name });
    if (rows.length >= MAX_HISTORY_ROWS) break;
  }
  return rows;
};

// Best-effort, tailored task suggestions for a newly-approved event.
// Throws on any failure (missing API key, rate limit, malformed
// response) — callers are expected to catch and fall back to a safe
// static default rather than blocking the approval flow on this.
//
// activeMembers is this ministry's current active roster ([{id, name}]),
// used both to build the assignment-history facts and — critically — to
// re-validate whatever suggested_assignee_id comes back, since the tool
// schema's enum is not a server-side guarantee on its own.
const suggestTasksForEvent = async ({ event, flyer, ministry, pastTasks = [], activeMembers = [] }) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const activeMembersById = new Map(activeMembers.map((m) => [String(m.id), m]));
  const rawHistory = buildAssignmentHistory(pastTasks, activeMembersById);
  const assignmentHistory = rawHistory.length >= MIN_HISTORY_FOR_SUGGESTION ? rawHistory : [];
  const candidateIds = assignmentHistory.length ? Array.from(activeMembersById.keys()) : [];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [SUGGEST_TASKS_TOOL({ candidateIds })],
    tool_choice: { type: "tool", name: "suggest_tasks" },
    messages: [{ role: "user", content: buildPrompt({ event, flyer, ministry, assignmentHistory }) }],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "suggest_tasks",
  );
  const tasks = toolUse?.input?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("Model did not return any suggested tasks");
  }

  return tasks.map((t) => {
    // The enum in the tool schema is a hint to the model, not a
    // server-enforced guarantee — re-validated here against the exact
    // same active-roster map used to build the history, so a stale,
    // malformed, or invented id can never reach the frontend.
    const suggestedMember = t.suggested_assignee_id
      ? activeMembersById.get(String(t.suggested_assignee_id))
      : null;

    return {
      title: t.title,
      description: t.description || undefined,
      due_date: new Date(event.start.getTime() + (t.due_date_offset_days || 0) * 24 * 60 * 60 * 1000),
      suggested_assignee: suggestedMember
        ? { user_id: suggestedMember.id, name: suggestedMember.name, reason: t.suggested_assignee_reason || undefined }
        : undefined,
    };
  });
};

module.exports = { suggestTasksForEvent };
