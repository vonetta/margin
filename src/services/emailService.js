const Anthropic = require("@anthropic-ai/sdk");

// Deliberately separate from generationService.js's caption/social voice —
// this is formal one-to-one correspondence (a guest speaker, a partner
// ministry), not promotional content for a congregation. Different
// register, no hashtags, no CTA library, structured around logistics
// rather than a hook/body/CTA shape.
const EMAIL_TYPE_GUIDANCE = {
  invitation:
    "Inviting a prospective guest speaker or contributor to a specific event. Convey what the event is, why they're being invited, and what's being asked of them (the kind of ministry assignment, approximate time). Invite a reply, don't assume acceptance.",
  confirmation:
    "Confirming an already-accepted invitation and laying out the concrete logistics: date, time, location, the ministry assignment/role and how long it runs, honorarium, hospitality arrangements, and any other specifics that were actually discussed (product table, rider terms, host liaison). This reads as a confirmation memo a partner ministry would send, not a sales pitch — warm but precise.",
  reminder:
    "A check-in as the event date approaches. Reconfirm the key logistics (date, time, location) briefly and ask whether anything has changed or whether they need anything further from your side.",
  thank_you:
    "A post-event thank-you. Express genuine, specific appreciation for what they brought to the event — reference particulars from the conversation, not generic gratitude — and leave the door open for future partnership.",
};

const buildEmailSystemPrompt = (profile, ministry, emailType, recipientName) => {
  const voiceProfile = profile.voice_profile;
  const avoidList = voiceProfile.avoid.join(", ");
  const sops = profile.sops.map((s) => `${s.title}: ${s.content}`).join("\n\n");
  const guidance = EMAIL_TYPE_GUIDANCE[emailType] || "";

  return `You are drafting formal correspondence on behalf of ${ministry.name}, in the voice of ${voiceProfile.persona_name}.

This is a real one-to-one email to a guest speaker or partner ministry — ${recipientName ? `addressed to ${recipientName}` : "addressed to a named recipient"} — not social media content. Write it as an actual letter: a greeting, plain prose paragraphs, a close. Not a promotional caption, no hashtags, no emoji, no marketing language.

EMAIL TYPE: ${emailType}
${guidance}

VOICE
- Write as ${voiceProfile.persona_name} would in formal written correspondence: gracious, direct, and respectful of the relationship — warmer and more personal than a business email, but still a real letter.
- Close with: "${voiceProfile.sign_off}"
- Never use em dashes.
- Never use: ${avoidList}
- Never invent a fact — a date, amount, location, name, or detail that wasn't actually given in this conversation. If something essential to this email type is missing, ask for it instead of guessing.

OPERATIONAL CONTEXT THAT MAY BE RELEVANT (use only what actually applies)
${sops || "(none on file)"}

Once you have everything you need to write a complete, accurate email, call the finalize_email tool with the subject and full body as the only output for that turn — no text alongside it. If you're missing something essential (a date, an amount, a location), ask exactly one short question instead of guessing.`;
};

const FINALIZE_EMAIL_TOOL = {
  name: "finalize_email",
  description:
    "Submit the final, complete email once you have everything you need to write it accurately. This ends the conversation.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "A clear, professional subject line for this email.",
      },
      body: {
        type: "string",
        description:
          "The full email body, ready to send — including the greeting and sign-off.",
      },
    },
    required: ["subject", "body"],
  },
};

const emailChatTurn = async ({
  profile,
  ministry,
  emailType,
  recipientName,
  messages,
}) => {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: buildEmailSystemPrompt(profile, ministry, emailType, recipientName),
    tools: [FINALIZE_EMAIL_TOOL],
    messages,
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "finalize_email",
  );
  if (toolUse) {
    return {
      done: true,
      subject: toolUse.input.subject,
      body: toolUse.input.body,
    };
  }

  const textBlock = response.content.find((block) => block.type === "text");
  return { done: false, message: textBlock ? textBlock.text : "" };
};

module.exports = {
  EMAIL_TYPE_GUIDANCE,
  buildEmailSystemPrompt,
  emailChatTurn,
};
