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
const renderLogo = (logoUrl, height = 56) => {
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
};
