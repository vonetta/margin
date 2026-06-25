const Anthropic = require("@anthropic-ai/sdk");

// AiProfile stores ctas/registers as Mongoose Maps. Object.entries() on a
// real Mongoose Map returns its internal bookkeeping properties, not the
// actual data, so iterate via .entries() for Maps and fall back to
// Object.entries() for plain objects (e.g. in tests).
const mapEntries = (value) =>
  value instanceof Map
    ? Array.from(value.entries())
    : Object.entries(value || {});

const buildSystemPrompt = (profile, ministry) => {
  const voiceProfile = profile.voice_profile;

  const toneList = voiceProfile.tone_pillars.join(", ");
  const avoidList = voiceProfile.avoid.join(", ");
  const samplePhrases = voiceProfile.sample_phrases
    .map((p) => `"${p}"`)
    .join("\n");
  const brandHashtags = profile.hashtags.brand.join(" ");
  const contentHashtags = profile.hashtags.content.join(" ");

  const ctas = mapEntries(profile.ctas)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const sops = profile.sops.map((s) => `${s.title}: ${s.content}`).join("\n\n");

  const templates = profile.templates
    .map((t) => `${t.title}: ${t.content}`)
    .join("\n\n");

  const recurringContent = profile.recurring_content
    .map((r) => `${r.title}: ${r.content}`)
    .join("\n\n");

  const registers = mapEntries(voiceProfile.registers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `You are the official content generation assistant for ${ministry.name}. Your sole purpose is to generate captions, announcements, and social media content that sounds exactly like ${voiceProfile.persona_name} and no one else.

IDENTITY AND VOICE

You write as ${voiceProfile.persona_name}. Every piece of content must carry these qualities: ${toneList}.

Sign-off for personal milestone content: "${voiceProfile.sign_off}"

COMMUNICATION REGISTERS

${voiceProfile.persona_name} writes in three distinct registers. Match the correct one based on context:

${registers}

VOICE EXAMPLES — STUDY THESE

CORRECT examples of how ${voiceProfile.persona_name} writes:
${samplePhrases}

LANGUAGE RULES NON-NEGOTIABLE

- Never use em dashes anywhere in the output. Not in captions, not in headers, not anywhere.
- Never use: ${avoidList}
- Never manufacture hype, artificial urgency, or panic to drive action.
- Never mix KTM content with Salt & Light content. ${ministry.entity_boundary}
- Never add a disclaimer, preamble, or explanation before the content. Return the content only.

CALLS TO ACTION

${ctas}

HASHTAGS

Always include these brand identity tags on every social post:
${brandHashtags}

Add these content-specific tags when content is prophetic, deliverance, or discernment focused:
${contentHashtags}

Do not add hashtags outside the approved list unless explicitly instructed.
Do not include hashtags on email content.

STANDARD OPERATING PROCEDURES

${sops}

CONTENT TEMPLATES

${templates}

RECURRING CONTENT AND BRANDING

${recurringContent}

OUTPUT FORMAT

For Instagram captions:
- Opening line must stop the scroll
- Body carries the detail, invitation, or teaching point
- CTA near the end, clear and directive
- Hashtags on the final line

For Facebook captions:
- Slightly longer and more detailed than Instagram
- Same structure: hook, body, CTA, hashtags

For email announcements:
- Structured, formal, and direct
- No hashtags
- Short and direct for internal. Warmer and more personal for community-facing.

For quote cards:
- Single sentence or short statement only
- Must stand completely alone without context
- Maximum impact, minimum words

WHAT YOU NEVER DO

- Do not add hashtags outside the approved list
- Do not use em dashes under any circumstances
- Do not write in a casual, hype-driven, or corporate tone
- Do not invent event details, use only what is provided
- Do not add a disclaimer, preamble, or explanation to your output, return the content only`;
};

const generateContent = async (prompt, profile, ministry, platform) => {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = buildSystemPrompt(profile, ministry);

  const userMessage = `Generate content for the following platform: ${platform}

${prompt}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return message.content[0].text;
};

const FINALIZE_TOOL = {
  name: "finalize_caption",
  description:
    "Submit the final, complete piece of content once you have everything you need to write it accurately. This ends the conversation.",
  input_schema: {
    type: "object",
    properties: {
      caption: {
        type: "string",
        description: "The final content, fully written and ready to post.",
      },
      event: {
        type: "object",
        description:
          "Structured event details mentioned anywhere in the conversation, so they can be reused to generate a matching flyer. Include this object whenever the content is about a specific event with a date, location, or similar — omit individual fields that were never mentioned. Omit the whole `event` object entirely for non-event content (a quote card, a general reflection, a recurring series with no single date). Pull description and theme_tags from the same well of detail you used to write the caption itself — the flyer should feel as substantive as the caption, not just the bare logistics.",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          description: {
            type: "string",
            description:
              "One short, evocative sentence capturing the heart/why of the event — pulled from the same voice and detail used in the caption's hook or body, not a repeat of the title. Omit if the caption doesn't have anything beyond logistics to draw from.",
          },
          theme_tags: {
            type: "array",
            items: { type: "string" },
            description:
              "2-4 short words or phrases naming the pillars/focus of the event (e.g. [\"Teaching\", \"Impartation\", \"Activation\"]), only if the conversation actually named distinct themes — don't invent generic ones just to fill this in.",
          },
          audience: {
            type: "string",
            description:
              "Who this is for, in a few words (e.g. \"Worship leaders, singers, and songwriters\"), if mentioned anywhere in the conversation.",
          },
          date: { type: "string" },
          location: { type: "string" },
          cost: { type: "string" },
          cta: { type: "string" },
          registration_url: { type: "string" },
        },
      },
    },
    required: ["caption"],
  },
};

const SWITCH_MINISTRY_TOOL = {
  name: "switch_ministry",
  description:
    "Call this once the user has confirmed the content actually belongs to a different ministry you have access to, instead of the one currently active. This hands off to that ministry's own voice, branding, and hashtags — do not write or finalize any caption on this turn, the conversation will continue under the correct ministry afterward.",
  input_schema: {
    type: "object",
    properties: {
      ministry_id: {
        type: "string",
        description: "The ministry_id of the other ministry to switch to.",
      },
      note: {
        type: "string",
        description:
          "One short sentence confirming the switch, shown to the user (e.g. \"Got it — continuing this under Salt & Light.\").",
      },
    },
    required: ["ministry_id", "note"],
  },
};

const buildChatSystemPrompt = (
  profile,
  ministry,
  platform,
  availableMinistries = [],
) => {
  const siblings = availableMinistries.filter(
    (m) => m.ministry_id !== ministry.ministry_id,
  );
  const siblingSection = siblings.length
    ? `\n\nOTHER MINISTRIES YOU HAVE ACCESS TO\n\nThe person you're talking to also has access to: ${siblings
        .map((m) => `${m.name} (ministry_id: "${m.ministry_id}")`)
        .join(", ")}. If the content actually belongs to one of these instead of ${ministry.name}, ask the user to confirm which one — don't guess. Once they confirm, call the switch_ministry tool with that ministry_id instead of writing the caption yourself; you don't have that ministry's voice profile loaded, so anything you wrote here would be in the wrong voice.`
    : "";

  return `${buildSystemPrompt(profile, ministry)}

CONVERSATIONAL MODE

You are now in a back-and-forth conversation with a ministry team member who wants content created for ${platform}. You will often not have everything you need on the first message. Some messages will describe a flyer that's already been made (sometimes as an extracted summary of an uploaded image) — treat those facts as already known and don't ask the user to repeat them.

If you are missing information that would materially change what you write, ask exactly ONE short, specific question per turn. Do not ask more than one question at a time, and do not call the finalize_caption tool on a turn where you ask a question. Reasons to ask:
- The event is co-hosted, partnered, or otherwise doesn't cleanly belong to ${ministry.name} — ask directly whether this is a partnered event and how it should be framed. A partnered event can still be written in this ministry's voice once you know who else is involved. Don't refuse to write it just because it doesn't fit neatly.
- The audience, spiritual framing/series tie-in, cost, registration link, or location is needed for this platform and hasn't been given.${siblingSection}

Once you have enough to write complete, accurate content for ${ministry.name}, call the finalize_caption tool with the final content as the only output for that turn — no text alongside it. Always include the \`event\` object in that call when the content is about a specific event, with whatever structured fields (title, date, location, cost, cta, registration_url) were mentioned, so a matching flyer can be generated from the same facts without asking the user to retype them.`;
};

const chatTurn = async ({
  profile,
  ministry,
  platform,
  messages,
  availableMinistries = [],
}) => {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = [FINALIZE_TOOL];
  if (availableMinistries.some((m) => m.ministry_id !== ministry.ministry_id)) {
    tools.push(SWITCH_MINISTRY_TOOL);
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: buildChatSystemPrompt(profile, ministry, platform, availableMinistries),
    tools,
    messages,
  });

  const switchUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "switch_ministry",
  );
  if (switchUse) {
    return {
      done: false,
      switchTo: {
        ministry_id: switchUse.input.ministry_id,
        note: switchUse.input.note,
      },
      message: switchUse.input.note,
    };
  }

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "finalize_caption",
  );
  if (toolUse) {
    return {
      done: true,
      caption: toolUse.input.caption,
      event: toolUse.input.event || null,
    };
  }

  const textBlock = response.content.find((block) => block.type === "text");
  return { done: false, message: textBlock ? textBlock.text : "" };
};

module.exports = {
  generateContent,
  buildSystemPrompt,
  chatTurn,
  buildChatSystemPrompt,
};
