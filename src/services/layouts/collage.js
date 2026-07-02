const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  brandGradient,
  renderSeal,
  resolveStyledTheme,
  resolveLogo,
  iconForLabel,
  renderIconBadge,
} = require("./shared");

const meta = {
  name: "Collage",
  description:
    "Scattered, rotated photo cards over a bold color field with a seal badge. Retreats, camps, and multi-photo recap-style events.",
  suits_tones: ["warm", "energetic"],
  needs_host: false,
  ideal_speakers: "0-6",
};

// Fixed placements (position % + rotation) for up to 6 photos, tuned to
// spread across the canvas without a photo's rotated corner clipping past
// the edges. Ordered so the first photo lands biggest/most central.
const SLOTS = [
  { top: 18, left: 8, width: 300, rotate: -6, z: 3 },
  { top: 14, left: 56, width: 260, rotate: 5, z: 2 },
  { top: 46, left: 4, width: 230, rotate: 4, z: 2 },
  { top: 50, left: 62, width: 250, rotate: -4, z: 3 },
  { top: 78, left: 22, width: 240, rotate: -3, z: 1 },
  { top: 32, left: 32, width: 210, rotate: 8, z: 1 },
];

const render = ({
  size = "social",
  dims: providedDims = null,
  typography,
  branding = {},
  content = {},
  host = null,
  speakers = [],
  qrDataUrl = null,
  fontsUrl = null,
  style = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
  const { s, primary, accent, gold, display, body, accentFont } =
    resolveStyledTheme(branding, typography, style);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const badgeText = escapeHtml(content.badge_text || content.cta || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const audience = escapeHtml(content.audience || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const { logo, footerLogoNeedsInvert } = resolveLogo(branding, s, {
    safePlacements: ["top-left", "top-center"],
  });

  // Photos come from whoever has a real image — host first, then speakers —
  // since this layout is about the scattered-memories look, not any one
  // person's role.
  const people = [host, ...speakers].filter((p) => p && (p.cutout_url || p.headshot_url));
  const photoCards = people
    .slice(0, SLOTS.length)
    .map((p, i) => {
      const img = p.cutout_url || p.headshot_url;
      const slot = SLOTS[i];
      return `<div class="photo-card" style="top:${slot.top}%; left:${slot.left}%; width:${slot.width}px; transform: rotate(${slot.rotate}deg); z-index:${slot.z};">
        <div class="photo-inner" style="background-image:url('${img}');"></div>
      </div>`;
    })
    .join("");

  const metaItems = [
    dateLine && { label: "When", value: dateLine },
    location && { label: "Where", value: location },
    cost && { label: "Cost", value: cost },
    audience && { label: "For", value: audience },
  ].filter(Boolean);

  const metaRow = metaItems.length
    ? `<div class="meta-row">${metaItems
        .map(
          (m) =>
            `<div class="meta-item">${renderIconBadge(iconForLabel(m.label), { size: 32, bg: "#fff", color: primary })}<div><div class="meta-label">${escapeHtml(m.label)}</div><div class="meta-value">${m.value}</div></div></div>`,
        )
        .join("")}</div>`
    : "";

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; background: ${brandGradient({ primary, accent, gold }, s.gradient_angle)}; }
    .logo-backing { display: inline-flex; align-items: center; justify-content: center; }
    .logo-backing-circle { background: #fff; border-radius: 50%; padding: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .logo-backing-pill { background: #fff; border-radius: 999px; padding: 8px 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .top-bar { position: absolute; top: 28px; left: 32px; z-index: 5; }
    ${footerLogoNeedsInvert ? ".top-bar .logo { filter: brightness(0) invert(1); }" : ""}
    .photo-field { position: absolute; inset: 0; z-index: 1; }
    .photo-card { position: absolute; background: #fff; padding: 10px 10px 30px; border-radius: 4px; box-shadow: 0 14px 34px rgba(0,0,0,0.4); }
    .photo-inner { width: 100%; aspect-ratio: 1; background-size: cover; background-position: center; border-radius: 2px; }
    .seal-slot { position: absolute; top: 40px; right: 40px; z-index: 6; }
    .title-block { position: absolute; left: 0; right: 0; bottom: 258px; z-index: 4; text-align: center; padding: 0 60px; }
    .title { font-family: '${display}', serif; font-weight: 800; font-size: ${s.title_size}px; line-height: 1.0; color: #fff; text-transform: uppercase; text-shadow: 0 4px 24px rgba(0,0,0,0.55); }
    .subtitle-script { font-family: '${accentFont}', cursive; font-size: ${s.subtitle_size}px; color: ${gold}; line-height: 1; margin-top: 8px; text-shadow: 0 2px 14px rgba(0,0,0,0.5); }
    .footer { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.96); padding: 22px 48px; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 28px; flex-wrap: wrap; border-top: 4px solid ${gold}; }
    .meta-row { display: flex; align-items: center; justify-content: center; gap: 26px; flex-wrap: wrap; }
    .meta-item { display: flex; align-items: center; gap: 10px; }
    .meta-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${accent}; }
    .meta-value { font-size: 17px; font-weight: 700; color: ${primary}; }
    .qr-img { width: 84px; height: 84px; background: #fff; padding: 5px; border-radius: 6px; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="photo-field">${photoCards}</div>
  ${logo ? `<div class="top-bar">${logo}</div>` : ""}
  ${badgeText ? `<div class="seal-slot">${renderSeal(badgeText, { bg: gold, color: primary, size: 130 })}</div>` : ""}
  <div class="title-block">
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle-script">${subtitle}</div>` : ""}
  </div>
  <div class="footer">
    ${metaRow}
    ${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-img" alt="QR" title="${qrCaption}" />` : ""}
  </div>
</body></html>`;
};

module.exports = { meta, render };
