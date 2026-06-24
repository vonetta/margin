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

// Build a brand-aware, layout-aware prompt
const buildPrompt = (ministry, layout, tone) => {
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

  return `An elegant abstract background for a ministry event flyer. ${hint}. Cohesive palette harmonious with these brand colors: ${palette}. Luminous, with a clear readable center and generous negative space. No text, no words, no logos, no people.`;
};

// Pick an existing background by tone, or generate + store a new one.
const selectBackground = async ({ ministryId, layout, tone }) => {
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

  // 2. Nothing in the library — generate one
  const ministry = await Ministry.findOne({ ministry_id: ministryId });
  const prompt = buildPrompt(ministry, layout, tone);
  const png = await generateBackground(prompt, { aspectRatio: "4:5" });
  const { key, url } = await uploadFile({
    ministryId,
    category: "backgrounds",
    buffer: png,
    contentType: "image/png",
    originalName: "auto-bg",
  });
  const created = await Background.create({
    ministry_id: ministryId,
    prompt,
    url,
    key,
    tone,
  });

  return { url, id: created._id, generated: true };
};

module.exports = { selectBackground, buildPrompt };
