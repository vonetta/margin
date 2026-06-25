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

// Pick an existing background by tone, or generate + store a new one. A
// plain gradient (every layout's built-in fallback) reads as flat once
// it's the only thing filling an otherwise-empty canvas — generating a
// real topic-relevant image gives that space something to look at,
// without the risk a full photoreal scene carries (fake faces, unreliable
// text), since this stays strictly abstract/atmospheric by prompt design.
const selectBackground = async ({ ministryId, layout, tone, topicHint }) => {
  // 1. Try the library — prefer a tone match, else most recent
  const filter = { ministry_id: ministryId };
  let background = null;

  if (tone) {
    background = await Background.findOne({ ...filter, tone }).sort({
      created_at: -1,
    });
  }
  if (!background) {
    background = await Background.findOne(filter).sort({ created_at: -1 });
  }
  if (background) {
    return { url: background.url, id: background._id, generated: false };
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

module.exports = { selectBackground, buildPrompt };
