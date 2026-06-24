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

module.exports = {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
  brandGradient,
  renderPill,
  renderRibbon,
  renderLogo,
};
