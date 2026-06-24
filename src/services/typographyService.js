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
    scores[tone] = (keywords || []).reduce((count, kw) => {
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

const pickFont = (fonts, role, tone) => {
  const candidates = fonts.filter((f) => f.roles.includes(role));
  if (candidates.length === 0) return null;

  if (tone) {
    const toneMatch = candidates.filter((f) => f.tones.includes(tone));
    if (toneMatch.length > 0) return toneMatch[0];
  }

  return candidates[0];
};

const selectTypography = (typeSystem, eventText = "") => {
  if (!typeSystem || !typeSystem.fonts || typeSystem.fonts.length === 0) {
    return {
      tone: null,
      display: { name: "Georgia" },
      body: { name: "Helvetica" },
      accent: null,
      fonts_used: ["Georgia", "Helvetica"],
    };
  }

  const tone = inferTone(eventText, typeSystem.tone_keywords);
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

module.exports = { selectTypography, inferTone, pickFont };
