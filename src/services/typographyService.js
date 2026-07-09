// A ministry only ever defines the tone categories/keywords it thought of
// during onboarding — usually skewed toward its own formal event types
// (conferences, ordinations), leaving common casual/social events (a
// pizza night, a game night) matching nothing and silently falling back
// to the ministry's default (formal) look. This baseline extends whatever
// category a ministry HAS defined that shares a name with one of these
// buckets — it never invents a category the ministry doesn't already
// have, it only adds more words to recognize under an existing one.
const DEFAULT_TONE_KEYWORDS = {
  casual: [
    "pizza",
    "game night",
    "movie night",
    "potluck",
    "cookout",
    "bbq",
    "barbecue",
    "hangout",
    "mixer",
    "social",
    "bowling",
    "trivia",
    "board game",
  ],
  energetic: [
    "pizza",
    "game night",
    "party",
    "bash",
    "youth",
    "lock-in",
    "lock in",
    "kickoff",
    "cookout",
  ],
  warm: ["potluck", "picnic", "fellowship dinner", "cookout", "family fun", "game night"],
  playful: ["pizza", "game night", "movie night", "trivia", "bowling", "fun"],
  fun: ["pizza", "game night", "movie night", "trivia", "bowling"],
};

// Merge a ministry's own keyword list for a tone with the default
// baseline for that SAME tone name (case-insensitive) — additive only,
// and only when the ministry already uses that category name themselves.
const expandedKeywords = (toneName, ministryKeywords) => {
  const defaults = DEFAULT_TONE_KEYWORDS[toneName.toLowerCase()] || [];
  return [...new Set([...(ministryKeywords || []), ...defaults])];
};

const inferTone = (eventText = "", toneKeywords = {}) => {
  const text = eventText.toLowerCase();

  const entries =
    toneKeywords instanceof Map
      ? Array.from(toneKeywords.entries())
      : Object.entries(toneKeywords || {});

  if (entries.length === 0) {
    return null;
  }

  const scores = {};
  for (const [tone, keywords] of entries) {
    scores[tone] = expandedKeywords(tone, keywords).reduce((count, kw) => {
      return count + (text.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
  }

  let bestTone = null;
  let bestScore = 0;
  for (const [tone, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestTone = tone;
    }
  }

  return bestTone;
};

// A small synonym table so a free-text AI guess ("playful") can land on a
// ministry's differently-named-but-equivalent category ("energetic")
// without the AI needing to know that ministry's exact vocabulary.
// Deliberately NOT the same list as DEFAULT_TONE_KEYWORDS above (that one
// extends keyword MATCHING against event text; this one maps CATEGORY
// NAMES to each other) — kept small and conservative on purpose.
const TONE_NAME_SYNONYMS = {
  casual: ["energetic", "warm", "playful", "fun"],
  playful: ["energetic", "casual", "warm", "fun"],
  fun: ["energetic", "casual", "playful", "warm"],
  energetic: ["casual", "playful", "fun"],
  warm: ["casual", "classic"],
  formal: ["classic"],
  classic: ["formal", "warm"],
};

// Clamps the model's free-text tone proposal to one of the ministry's OWN
// defined tone_keywords categories — the model can suggest a word, but it
// can never introduce a category the ministry didn't already define. This
// is the same "propose, then server clamps to a safe/known value" pattern
// validateStyle already applies to numeric style overrides. Returns null
// (no preference — today's existing default behavior) when nothing
// reasonably matches, rather than guessing.
const resolveTone = (proposedTone, toneKeywords) => {
  if (!proposedTone) return null;

  const entries =
    toneKeywords instanceof Map
      ? Array.from(toneKeywords.keys())
      : Object.keys(toneKeywords || {});
  if (entries.length === 0) return null;

  const proposed = proposedTone.trim().toLowerCase();

  // 1. Exact match against one of the ministry's own category names.
  const exact = entries.find((name) => name.toLowerCase() === proposed);
  if (exact) return exact;

  // 2. Synonym match — the model's word maps to a known-equivalent name
  // the ministry does use.
  const synonymTargets = TONE_NAME_SYNONYMS[proposed] || [];
  const bySynonym = entries.find((name) =>
    synonymTargets.includes(name.toLowerCase()),
  );
  if (bySynonym) return bySynonym;

  return null;
};

const pickFont = (fonts, role, tone) => {
  const candidates = fonts.filter((f) => f.roles.includes(role));
  if (candidates.length === 0) return null;

  if (tone) {
    const toneMatch = candidates.filter((f) => f.tones.includes(tone));
    if (toneMatch.length > 0) return toneMatch[0];
  }

  return candidates[0];
};

// resolvedTone, when provided (an AI-proposed tone already clamped via
// resolveTone), is used as-is instead of running keyword inference — one
// clear source of truth per call rather than layering the two. Omitted
// entirely (undefined) on the manual-entry flyer path, where behavior
// stays exactly what it was before this existed.
const selectTypography = (typeSystem, eventText = "", resolvedTone) => {
  if (!typeSystem || !typeSystem.fonts || typeSystem.fonts.length === 0) {
    return {
      tone: null,
      display: { name: "Georgia" },
      body: { name: "Helvetica" },
      accent: null,
      fonts_used: ["Georgia", "Helvetica"],
    };
  }

  const tone =
    resolvedTone !== undefined ? resolvedTone : inferTone(eventText, typeSystem.tone_keywords);
  const fonts = typeSystem.fonts;

  let display = pickFont(fonts, "display", tone);
  let body = pickFont(fonts, "body", tone);
  const accent =
    pickFont(fonts, "accent", tone) || pickFont(fonts, "script", tone);

  if (!display && typeSystem.default_display) {
    display = fonts.find((f) => f.name === typeSystem.default_display);
  }
  if (!body && typeSystem.default_body) {
    body = fonts.find((f) => f.name === typeSystem.default_body);
  }

  display = display || fonts[0];
  body = body || fonts[0];

  const fontsUsed = [
    ...new Set([display?.name, body?.name, accent?.name].filter(Boolean)),
  ];

  return {
    tone,
    display: display ? { name: display.name } : null,
    body: body ? { name: body.name } : null,
    accent: accent ? { name: accent.name } : null,
    fonts_used: fontsUsed,
  };
};

module.exports = { selectTypography, inferTone, pickFont, resolveTone };
