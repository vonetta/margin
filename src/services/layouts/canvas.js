const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
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
  typography,
  branding = {},
  content = {},
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
}) => {
  const dims = DIMENSIONS[size] || DIMENSIONS.social;
  const { primary, accent, gold } = resolveColors(branding);
  const { display, body, accent: accentFont } = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const panelLead = escapeHtml(content.panel_lead || "Save the Date");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const footerNote = escapeHtml(content.footer_note || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const bgStyle = backgroundUrl
    ? `background-image: url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, ${hexToRgba(primary, 0.8)}, ${hexToRgba(accent, 0.6)});`;

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; ${bgStyle} }
    .topbar { position: absolute; top: 0; left: 0; right: 0; padding: 54px 64px; z-index: 3; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: 78px; color: #fff; text-shadow: 0 3px 20px rgba(0,0,0,0.6); line-height: 1.02; }
    .subtitle { font-family: '${accentFont}', cursive; font-size: 52px; color: ${gold}; text-shadow: 0 2px 12px rgba(0,0,0,0.6); margin-top: 4px; }
    .panel { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 560px; background: ${hexToRgba(primary, 0.86)}; padding: 58px 54px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); z-index: 4; }
    .panel-lead { font-family: '${accentFont}', cursive; font-size: 70px; color: ${gold}; line-height: 0.9; }
    .panel-date { font-size: 40px; font-weight: 700; color: #fff; margin-top: 22px; }
    .panel-loc { font-size: 29px; color: rgba(255,255,255,0.92); margin-top: 14px; line-height: 1.4; }
    .qr-img { width: 160px; height: 160px; background: #fff; padding: 10px; border-radius: 10px; margin: 28px auto 0; }
    .qr-caption { font-size: 18px; color: ${gold}; margin-top: 10px; }
    .botbar { position: absolute; bottom: 0; left: 0; right: 0; background: ${hexToRgba(primary, 0.9)}; padding: 32px 64px; z-index: 3; text-align: center; }
    .botbar-note { font-size: 26px; font-weight: 600; color: #fff; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="topbar">
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
  </div>
  <div class="panel">
    <div class="panel-lead">${panelLead}</div>
    ${dateLine ? `<div class="panel-date">${dateLine}</div>` : ""}
    ${location ? `<div class="panel-loc">${location}</div>` : ""}
    ${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div>` : ""}
  </div>
  ${footerNote ? `<div class="botbar"><div class="botbar-note">${footerNote}</div></div>` : ""}
</body></html>`;
};

module.exports = { meta, render };
