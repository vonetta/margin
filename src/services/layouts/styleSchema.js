// The set of per-element style properties a flyer's content can propose,
// either from the AI (chat finalize step) or from a human stepping through
// the customization wizard. Every property has a hard min/max and a
// default — validateStyle() below clamps to these no matter the source,
// so a bad AI proposal (or a bad manual override) can never produce text
// that overflows the canvas, an invisible color, or a broken layout.
const STYLE_SCHEMA = {
  title_size: { type: "number", min: 40, max: 96, default: 70 },
  subtitle_size: { type: "number", min: 24, max: 64, default: 48 },
  description_visible: { type: "boolean", default: true },
  description_size: { type: "number", min: 14, max: 24, default: 18 },
  tags_visible: { type: "boolean", default: true },
  host_photo_size: { type: "number", min: 160, max: 280, default: 230 },
  speaker_photo_size: { type: "number", min: 120, max: 220, default: 170 },
  cta_size: { type: "number", min: 24, max: 48, default: 34 },
  logo_size: { type: "number", min: 40, max: 140, default: 84 },
  logo_placement: {
    type: "enum",
    options: ["top-left", "top-center", "footer"],
    default: "top-left",
  },
  color_variant: {
    type: "enum",
    options: ["brand", "warm", "cool", "accent_swap"],
    default: "brand",
  },
  // Free-form rather than validated against a fixed list: the wizard only
  // ever sends one of the ministry's own curated type_system fonts, so
  // there's nothing meaningful to clamp against here. An unrecognized name
  // just falls back to the browser's default serif/sans-serif — never a
  // broken render — so loose validation is an acceptable tradeoff for not
  // needing ministry-specific data inside this generic schema.
  display_font: { type: "string", default: null },
  body_font: { type: "string", default: null },
  accent_font: { type: "string", default: null },
};

const defaultStyle = () =>
  Object.fromEntries(
    Object.entries(STYLE_SCHEMA).map(([key, def]) => [key, def.default]),
  );

// Clamp/coerce a proposed style object (from the AI, or from a client
// request) against STYLE_SCHEMA. Unknown keys are dropped. Missing or
// invalid values fall back to the schema default for that key — this
// always returns a complete, safe object, never a partial one.
const validateStyle = (proposed = {}) => {
  const result = defaultStyle();
  for (const [key, def] of Object.entries(STYLE_SCHEMA)) {
    const value = proposed[key];
    if (value === undefined || value === null) continue;

    if (def.type === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) {
        result[key] = Math.min(def.max, Math.max(def.min, n));
      }
    } else if (def.type === "boolean") {
      result[key] = Boolean(value);
    } else if (def.type === "enum") {
      if (def.options.includes(value)) {
        result[key] = value;
      }
    } else if (def.type === "string") {
      if (typeof value === "string" && value.trim()) {
        result[key] = value.trim();
      }
    }
  }
  return result;
};

module.exports = { STYLE_SCHEMA, defaultStyle, validateStyle };
