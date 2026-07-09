const Background = require("../models/Background");
const Ministry = require("../models/Ministry");
const { generateBackground } = require("./imageService");
const { uploadFile } = require("./storageService");

// Layout → what kind of background it wants
const LAYOUT_BG_HINTS = {
  monument: "calm darker center so overlaid text stays readable",
  showcase: "calm darker center so overlaid text stays readable",
  canvas: "evocative full-scene imagery suitable as a backdrop",
  feature: "atmospheric, the portrait will cover most of it",
};

// Build a brand-aware, layout-aware, topic-aware prompt
const buildPrompt = (ministry, layout, tone, topicHint) => {
  const colors = ministry?.branding?.colors || {};
  const palette = [
    colors.primary,
    colors.accent,
    colors.gold,
    colors.background,
  ]
    .filter(Boolean)
    .join(", ");
  const hint = LAYOUT_BG_HINTS[layout] || "atmospheric and premium";
  const topicLine = topicHint
    ? ` Evoke the feeling of this specific event: ${topicHint} — through abstract shapes, light, and texture, not literal scenes.`
    : "";

  return `An elegant abstract background for a ministry event flyer. ${hint}.${topicLine} Cohesive palette harmonious with these brand colors: ${palette}. Luminous, with a clear readable area and generous negative space. Abstract and atmospheric only — no text, no words, no logos, no recognizable faces, no photoreal human figures.`;
};

// A more literal, representational prompt — real scenes, real people —
// for the wizard's opt-in "generate a relevant image" flow. Deliberately
// separate from buildPrompt above: this is only ever used behind an
// explicit user action where they see the result and choose to use it or
// not, which is what makes the fake-face/unreliable-content risk
// acceptable here in a way it wasn't for the silent auto-fallback.
const buildLiteralPrompt = (ministry, topicHint) => {
  const colors = ministry?.branding?.colors || {};
  const palette = [
    colors.primary,
    colors.accent,
    colors.gold,
    colors.background,
  ]
    .filter(Boolean)
    .join(", ");
  const topicLine = topicHint
    ? ` The event: ${topicHint}.`
    : " A church gathering.";

  return `A real, relevant photo-style image for a ministry event flyer.${topicLine} Show people authentically engaged — worship, prayer, a small group, hands raised, or a gathered congregation, whichever fits best. Fill the frame with the scene — the subject should fill most of the frame, shot close enough that it reads as a full, rich composition, not small or distant with lots of empty space around it. Warm, natural lighting, documentary/editorial photography style, not staged or artificial-looking. Cohesive with this color palette where natural: ${palette}. No text, no words, no logos overlaid on the image.`;
};

// Pick an existing background by tone, or generate + store a new one. A
// plain gradient (every layout's built-in fallback) reads as flat once
// it's the only thing filling an otherwise-empty canvas — generating a
// real topic-relevant image gives that space something to look at,
// without the risk a full photoreal scene carries (fake faces, unreliable
// text), since this stays strictly abstract/atmospheric by prompt design.
const selectBackground = async ({ ministryId, layout, tone, topicHint }) => {
  const filter = { ministry_id: ministryId };

  if (tone) {
    // A specific tone was resolved — only reuse a background tagged with
    // that same tone. Falling through to "most recent, any tone" here
    // would let a resolved tone (e.g. "casual") silently inherit whatever
    // backdrop a prior, unrelated-tone flyer happened to generate (a
    // pizza night getting a somber conference's moody gradient, or worse,
    // the reverse) — the exact bug this exists to prevent. If nothing
    // matches, fall through to generating a fresh one below instead.
    const toneMatch = await Background.findOne({ ...filter, tone }).sort({ created_at: -1 });
    if (toneMatch) {
      return { url: toneMatch.url, id: toneMatch._id, generated: false };
    }
  } else {
    // No tone signal at all (new ministry, or the event's text didn't
    // resolve to any of the ministry's own tone categories) — there's no
    // better basis to pick on, so reusing whatever's most recent is a
    // reasonable default, same as before.
    const anyMatch = await Background.findOne(filter).sort({ created_at: -1 });
    if (anyMatch) {
      return { url: anyMatch.url, id: anyMatch._id, generated: false };
    }
  }

  // 2. Nothing in the library — generate one, store it, and reuse it for
  // future flyers with this tone. If generation fails for any reason
  // (quota, transient API error), fall back to the gradient rather than
  // failing the whole flyer.
  try {
    const ministry = await Ministry.findOne({ ministry_id: ministryId });
    const prompt = buildPrompt(ministry, layout, tone, topicHint);
    const png = await generateBackground(prompt);
    const { key, url } = await uploadFile({
      ministryId,
      category: "backgrounds",
      buffer: png,
      contentType: "image/png",
      originalName: "background",
    });
    const created = await Background.create({
      ministry_id: ministryId,
      prompt,
      url,
      key,
      tone,
    });
    return { url: created.url, id: created._id, generated: true };
  } catch (error) {
    console.error("Auto background generation failed, using gradient fallback:", error);
    return { url: null, id: null, generated: false };
  }
};

module.exports = { selectBackground, buildPrompt, buildLiteralPrompt };
