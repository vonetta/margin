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
// alpha (0-1) lets the gradient be layered as a translucent overlay on top
// of a real background photo via standard CSS multi-background stacking,
// instead of only ever being the opaque fallback when there's no photo.
const brandGradient = (colors, angle = 150, alpha = 1) => {
  const stops = [colors.primary, colors.accent || colors.primary, colors.gold]
    .filter(Boolean)
    .map((c) => hexToRgba(c, alpha));
  // Layer a soft radial highlight over the linear gradient for some depth
  // — a flat two/three-stop linear gradient alone reads as a placeholder.
  return `radial-gradient(circle at 25% 15%, ${hexToRgba("#ffffff", 0.18 * alpha)}, transparent 45%), linear-gradient(${angle}deg, ${stops.join(", ")})`;
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

// Inline stroke-based icons (not emoji). Headless Chromium in the
// Puppeteer render environment has no color-emoji font installed, so 📅/📍/
// 💰/👥 all fall back to the same generic "tofu" glyph — every info row
// ends up showing one indistinguishable icon instead of a distinct one per
// type. SVG paths render identically everywhere, no font dependency.
const ICON_PATHS = {
  calendar: `<path d="M7 2.5v3M17 2.5v3M4 8h16M5.5 4.5h13A1.5 1.5 0 0 1 20 6v13.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5V6a1.5 1.5 0 0 1 1.5-1.5Z"/>`,
  pin: `<path d="M12 21s7-7.4 7-12.4a7 7 0 1 0-14 0C5 13.6 12 21 12 21Z"/><circle cx="12" cy="8.6" r="2.6"/>`,
  dollar: `<path d="M12 2.5v19M17 6.8c0-2.1-2.2-3.6-5-3.6s-5 1.6-5 3.8c0 4.5 10 2.3 10 6.9 0 2.2-2.2 3.8-5 3.8s-5-1.5-5-3.8"/>`,
  users: `<circle cx="8.8" cy="8" r="3.2"/><path d="M2.3 20.2c0-3.7 2.9-6.2 6.5-6.2s6.5 2.5 6.5 6.2"/><circle cx="17.2" cy="9" r="2.6"/><path d="M14.7 14.2c2.7.5 4.5 2.6 4.5 6"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.3 2"/>`,
  ticket: `<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v1.8a2 2 0 0 0 0 3.4v1.8A1.5 1.5 0 0 1 19.5 17h-15A1.5 1.5 0 0 1 3 15.5v-1.8a2 2 0 0 0 0-3.4V8.5Z"/><path d="M9.5 7v10" stroke-dasharray="2.2 2.2"/>`,
};

// Which icon a given info-row label should use, so layouts don't each hand-
// pick an icon (and can't accidentally drift back to emoji).
const ICON_FOR_LABEL = {
  when: "calendar",
  where: "pin",
  cost: "dollar",
  for: "users",
};

const iconForLabel = (label) => ICON_FOR_LABEL[String(label || "").toLowerCase()] || "calendar";

const renderIconSvg = (name, { size = 18, color = "#fff", strokeWidth = 1.8 } = {}) => {
  const paths = ICON_PATHS[name] || ICON_PATHS.calendar;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
};

// A circular icon badge — the visual replacement for the old emoji-in-a-
// circle meta-icon. Same footprint/markup shape as before so layouts can
// drop it straight into an existing `.meta-icon`-style container.
const renderIconBadge = (name, { size = 36, bg = "#1a1a2e", color = "#fff", iconSize } = {}) => {
  return `<span class="icon-badge" style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${renderIconSvg(name, { size: iconSize || Math.round(size * 0.5), color })}</span>`;
};

// CSS for gradient/foil script text — a solid brand-gradient fill clipped to
// the text shape, used for cursive accent lines (the "handwritten gold
// foil" look in reference flyers) instead of a single flat color.
const gradientTextStyle = (colors, angle = 100) => {
  const stops = [colors.gold, colors.accent || colors.gold, colors.gold].filter(Boolean);
  return `background: linear-gradient(${angle}deg, ${stops.join(", ")}); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;`;
};

// A circular badge/seal with ring border and centered text — the "Special
// Celebration" ribbon-seal look, distinct from renderRibbon's flat banner
// tag (which is for short single-line role labels like HOST).
const renderSeal = (text, { bg, color = "#fff", size = 120, ring } = {}) => {
  if (!text) return "";
  return `<div class="seal" style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;text-align:center;padding:${Math.round(size * 0.12)}px;border:3px solid ${ring || hexToRgba(color, 0.55)};box-shadow:0 8px 22px rgba(0,0,0,0.3);flex-shrink:0;">
    <span style="font-size:${Math.round(size * 0.105)}px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;line-height:1.2;color:${color};">${escapeHtml(text)}</span>
  </div>`;
};

// eslint-disable-next-line global-require
const { validateStyle } = require("./styleSchema");

// The validate → derive-colors → resolve-fonts sequence is identical
// across every layout — pulled out once so feature/canvas/showcase don't
// each re-implement it slightly differently. extraDefaults lets a layout
// merge in its own pre-style defaults (e.g. monument's auto-scaled
// speaker_photo_size) before the explicit style overrides win.
const resolveStyledTheme = (branding, typography, style, extraDefaults = {}) => {
  const s = validateStyle({ ...extraDefaults, ...(style || {}) });
  const resolvedColors = resolveColors(branding);
  const { bg, text } = resolvedColors;
  const variants = deriveColorVariants(resolvedColors);
  const { primary, accent, gold } = variants[s.color_variant] || variants.brand;
  const resolvedFonts = resolveFonts(typography);
  const display = s.display_font || resolvedFonts.display;
  const body = s.body_font || resolvedFonts.body;
  const accentFont = s.accent_font || resolvedFonts.accent;
  return { s, primary, accent, gold, bg, text, display, body, accentFont };
};

// Wraps the logo in a solid backing shape when it's about to land on busy,
// variable-tone content (anywhere other than the two placements that sit
// on a readable solid/scrim panel) — even if the requested backing is
// "none", since a bare logo directly on a photo or bold gradient is close
// to unreadable regardless of which ministry's logo it is.
const resolveLogo = (branding, s, { safePlacements = ["top-left", "top-center"] } = {}) => {
  const logoRaw = renderLogo(branding.logo_url, s.logo_size);
  const onBusyBackground = !safePlacements.includes(s.logo_placement);
  const effectiveBacking =
    onBusyBackground && s.logo_backing === "none" ? "circle" : s.logo_backing;
  const logo =
    logoRaw && effectiveBacking !== "none"
      ? `<span class="logo-backing logo-backing-${effectiveBacking}">${logoRaw}</span>`
      : logoRaw;
  return { logo, footerLogoNeedsInvert: s.logo_backing === "none" };
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
  resolveStyledTheme,
  resolveLogo,
  iconForLabel,
  renderIconSvg,
  renderIconBadge,
  gradientTextStyle,
  renderSeal,
};
