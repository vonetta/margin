const escapeHtml = (str = "") => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const hexToRgba = (hex, alpha) => {
  const h = (hex || "#000000").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const DIMENSIONS = {
  social: { width: 1080, height: 1350 },
  print: { width: 1275, height: 1650 },
};

// Each platform has its own native aspect ratio — a flyer sized for an
// Instagram feed post looks cropped/wrong dropped straight into a Facebook
// link card or a square quote card. Print dimensions don't vary by
// platform, so only the "social" size slot is platform-aware.
const PLATFORM_DIMENSIONS = {
  Instagram: { width: 1080, height: 1350 }, // 4:5 feed post
  Facebook: { width: 1200, height: 1200 }, // square reads best in-feed
  "Quote card": { width: 1080, height: 1080 }, // square
  Email: { width: 1200, height: 628 }, // wide banner, fits inline in a body
};

const resolveDimensions = (size = "social", platform = null) => {
  if (size === "social" && platform && PLATFORM_DIMENSIONS[platform]) {
    return PLATFORM_DIMENSIONS[platform];
  }
  return DIMENSIONS[size] || DIMENSIONS.social;
};

// Resolve the colors a layout uses from ministry branding, with safe fallbacks
const resolveColors = (branding = {}) => {
  const c = branding.colors || {};
  return {
    primary: c.primary || "#1a1a2e",
    accent: c.accent || "#e94560",
    gold: c.gold || "#f5a623",
    bg: c.background || "#ffffff",
    text: c.text || "#1C1C1C",
  };
};

const hexToHsl = (hex) => {
  const h = (hex || "#000000").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h2 = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h2 = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h2 = ((b - r) / d + 2) * 60;
    else h2 = ((r - g) / d + 4) * 60;
  }
  return { h: h2, s, l };
};

const hslToHex = ({ h, s, l }) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Re-hue a color to a specific target hue while keeping its OWN saturation
// and lightness — used so a derived accent/gold stays exactly as vivid as
// the ministry's actual accent/gold, instead of inheriting primary's much
// darker, more muted tone.
const rehueTo = (hex, targetHue) => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: ((targetHue % 360) + 360) % 360 });
};

// Derive a handful of "on-brand but not identical" palette variants from a
// ministry's actual brand colors, instead of opening color choice up to
// anything — every variant is mathematically derived from the same source
// colors, so it can't drift off-brand no matter which one gets picked.
// primary deliberately never moves in any variant — every layout assumes
// primary is the dark, high-contrast anchor (body text, footer background),
// so reassigning it to a much lighter derived color breaks legibility
// regardless of which ministry's palette this runs on.
const deriveColorVariants = (colors) => {
  const { primary, accent, gold, bg, text } = colors;
  const primaryHue = hexToHsl(primary).h;
  return {
    brand: { primary, accent, gold, bg, text },
    // True triadic harmony: accent and gold land 120°/240° around the
    // color wheel from primary, each keeping its own saturation/lightness
    // so they still read as vivid accent colors, not muted primary clones.
    triad: {
      primary,
      accent: rehueTo(accent, primaryHue + 120),
      gold: rehueTo(gold, primaryHue + 240),
      bg,
      text,
    },
    // Split-complementary: one color sits directly opposite primary on the
    // wheel, the other 30° off that — a bolder, higher-contrast pairing
    // than triad without the two accent colors fighting each other.
    complementary: {
      primary,
      accent: rehueTo(accent, primaryHue + 180),
      gold: rehueTo(gold, primaryHue + 150),
      bg,
      text,
    },
    // Swaps which of the two highlight colors carries more visual weight,
    // using the exact same two colors rather than deriving new ones.
    accent_swap: { primary, accent: gold, gold: accent, bg, text },
  };
};

// Resolve fonts from selected typography, with safe fallbacks
const resolveFonts = (typography) => ({
  display: typography?.display?.name || "Georgia",
  body: typography?.body?.name || "Helvetica",
  accent: typography?.accent?.name || typography?.display?.name || "Georgia",
});

// The new default background when no photo is supplied: a bold multi-stop
// brand-color gradient, not generic AI-generated abstract art. Reference
// flyers use real photos or simple solid/gradient color blocks — never
// painterly swirl art — so this is what every layout falls back to.
const brandGradient = (colors, angle = 150) => {
  const stops = [colors.primary, colors.accent || colors.primary, colors.gold]
    .filter(Boolean);
  // Layer a soft radial highlight over the linear gradient for some depth
  // — a flat two/three-stop linear gradient alone reads as a placeholder.
  return `radial-gradient(circle at 25% 15%, ${hexToRgba("#ffffff", 0.18)}, transparent 45%), linear-gradient(${angle}deg, ${stops.join(", ")})`;
};

// A small color-blocked info pill: bold label above, value below, inside a
// bordered rounded box — matches the "WHEN / WHERE / COST" badge pattern
// every reference flyer uses, instead of a plain text line.
const renderPill = ({ label, value, accent, textColor = "#fff" }) => {
  if (!value) return "";
  return `<div class="pill" style="border-color:${accent};background:rgba(0,0,0,0.32);">
    <div class="pill-label" style="color:${accent};">${escapeHtml(label)}</div>
    <div class="pill-value" style="color:${textColor};">${value}</div>
  </div>`;
};

// A small banner/ribbon tag for a role label (HOST, GUEST SPEAKER, etc.)
const renderRibbon = (text, bg, color = "#fff") => {
  if (!text) return "";
  return `<div class="ribbon" style="background:${bg};color:${color};">${escapeHtml(text)}</div>`;
};

// Logo block, top-left corner convention used by every reference flyer.
const renderLogo = (logoUrl, height = 80) => {
  if (!logoUrl) return "";
  return `<img class="logo" src="${logoUrl}" style="height:${height}px;" alt="logo" />`;
};

// A handful of loose, flowing curved strokes for texture over a gradient
// fallback (no real photo) — addresses backgrounds that otherwise read as a
// flat, empty color block once they're not confined to a small panel.
const abstractLinesOverlay = (color = "#ffffff", opacity = 0.14) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000' viewBox='0 0 800 1000'>
    <path d='M-100,180 C150,80 250,420 800,260' stroke='${color}' stroke-width='2' fill='none' opacity='${opacity}'/>
    <path d='M-100,520 C200,380 320,760 850,560' stroke='${color}' stroke-width='2' fill='none' opacity='${opacity}'/>
    <path d='M-50,850 C250,700 400,980 800,820' stroke='${color}' stroke-width='1.5' fill='none' opacity='${opacity * 0.85}'/>
    <path d='M100,-50 C300,150 150,300 450,200' stroke='${color}' stroke-width='1.5' fill='none' opacity='${opacity * 0.7}'/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

module.exports = {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  PLATFORM_DIMENSIONS,
  resolveDimensions,
  resolveColors,
  resolveFonts,
  brandGradient,
  renderPill,
  renderRibbon,
  renderLogo,
  abstractLinesOverlay,
  deriveColorVariants,
};
