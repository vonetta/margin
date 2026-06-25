const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
  brandGradient,
  renderLogo,
} = require("./shared");

const meta = {
  name: "Canvas",
  description:
    "Full-bleed venue photo with a translucent info panel. Save-the-dates and location-driven events.",
  suits_tones: ["warm", "classic"],
  needs_host: false,
  ideal_speakers: "0",
};

const render = ({
  size = "social",
  dims: providedDims = null,
  typography,
  branding = {},
  content = {},
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
  const { primary, accent, gold } = resolveColors(branding);
  const { display, body, accent: accentFont } = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const panelLead = escapeHtml(content.panel_lead || "Save the Date");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const cta = escapeHtml(content.cta || "");
  const footerNote = escapeHtml(content.footer_note || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";
  const logo = renderLogo(branding.logo_url, 72);

  // Without a real venue photo, this layout used to fall back to a flat
  // two-color gradient that looked like a placeholder. Same brand gradient
  // every other layout now uses by default.
  const bgStyle = backgroundUrl
    ? `background-image: url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold }, 145)};`;

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; ${bgStyle} }
    .topbar { position: absolute; top: 0; left: 0; right: 0; padding: 48px 64px; z-index: 3; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .topbar-text { flex: 1; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: 78px; color: #fff; text-shadow: 0 3px 20px rgba(0,0,0,0.6); line-height: 1.02; }
    .subtitle { font-family: '${accentFont}', cursive; font-size: 52px; color: ${gold}; text-shadow: 0 2px 12px rgba(0,0,0,0.6); margin-top: 4px; }
    .panel { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 580px; background: ${hexToRgba(primary, 0.88)}; border: 2px solid ${gold}; padding: 54px 50px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); z-index: 4; }
    .panel-lead { font-family: '${accentFont}', cursive; font-size: 66px; color: ${gold}; line-height: 0.9; }
    .panel-date { font-size: 38px; font-weight: 700; color: #fff; margin-top: 20px; }
    .panel-loc { font-size: 27px; color: rgba(255,255,255,0.92); margin-top: 12px; line-height: 1.4; }
    .panel-meta { display: flex; justify-content: center; gap: 28px; margin-top: 18px; }
    .meta-item { text-align: center; }
    .meta-label { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${gold}; }
    .meta-value { font-size: 22px; font-weight: 600; color: #fff; margin-top: 2px; }
    .qr-img { width: 150px; height: 150px; background: #fff; padding: 9px; border-radius: 10px; margin: 26px auto 0; }
    .qr-caption { font-size: 17px; color: ${gold}; margin-top: 10px; }
    .botbar { position: absolute; bottom: 0; left: 0; right: 0; background: ${primary}; border-top: 4px solid ${gold}; padding: 30px 64px; z-index: 3; text-align: center; }
    .botbar-note { font-family: '${display}', serif; font-size: 28px; font-weight: 700; color: ${gold}; text-transform: uppercase; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="topbar">
    <div class="topbar-text">
      <div class="title">${title}</div>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    </div>
    ${logo}
  </div>
  <div class="panel">
    <div class="panel-lead">${panelLead}</div>
    ${dateLine ? `<div class="panel-date">${dateLine}</div>` : ""}
    ${location ? `<div class="panel-loc">${location}</div>` : ""}
    ${
      cost
        ? `<div class="panel-meta"><div class="meta-item"><div class="meta-label">Cost</div><div class="meta-value">${cost}</div></div></div>`
        : ""
    }
    ${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div>` : ""}
  </div>
  ${footerNote || cta ? `<div class="botbar"><div class="botbar-note">${footerNote || cta}</div></div>` : ""}
</body></html>`;
};

module.exports = { meta, render };
