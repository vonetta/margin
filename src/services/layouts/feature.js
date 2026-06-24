const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
} = require("./shared");

const meta = {
  name: "Feature",
  description:
    "A single headliner dominates with a large portrait. Teaching series or solo-speaker events.",
  suits_tones: ["formal", "warm", "classic"],
  needs_host: true,
  ideal_speakers: "0",
};

const render = ({
  size = "social",
  typography,
  branding = {},
  content = {},
  host = null,
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
}) => {
  const dims = DIMENSIONS[size] || DIMENSIONS.social;
  const { primary, accent, gold } = resolveColors(branding);
  const { display, body, accent: accentFont } = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const kicker = escapeHtml(content.kicker || "");
  const cta = escapeHtml(content.cta || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const hostImg = host && (host.cutout_url || host.headshot_url);

  const bgStyle = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.7)}, ${hexToRgba(primary, 0.85)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(155deg, ${primary} 0%, ${hexToRgba(primary, 0.92)} 100%);`;

  const details = [
    dateLine && `<div><b>${dateLine}</b></div>`,
    location && `<div>${location}</div>`,
    cost && `<div><b>${cost}</b></div>`,
  ]
    .filter(Boolean)
    .join("");

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; ${bgStyle} }
    .hero-photo { position: absolute; right: 0; bottom: 0; width: 62%; height: 88%; background-image: url('${hostImg || ""}'); background-size: cover; background-position: center top; }
    .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, ${primary} 30%, ${hexToRgba(primary, 0.5)} 55%, ${hexToRgba(primary, 0)} 75%); }
    .content { position: relative; z-index: 3; padding: 90px 60px; height: 100%; display: flex; flex-direction: column; width: 64%; }
    .kicker { font-family: '${accentFont}', cursive; font-size: 56px; color: ${gold}; line-height: 0.9; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: 92px; line-height: 0.98; color: #fff; margin-top: 8px; text-shadow: 0 2px 24px rgba(0,0,0,0.4); }
    .subtitle { font-size: 26px; line-height: 1.45; color: rgba(255,255,255,0.9); margin-top: 24px; max-width: 440px; font-style: italic; }
    .who { margin-top: 36px; }
    .who-name { font-family: '${display}', serif; font-size: 50px; font-weight: 700; color: #fff; }
    .who-title { font-size: 23px; color: ${gold}; margin-top: 2px; }
    .footer { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
    .cta { font-family: '${accentFont}', cursive; font-size: 50px; color: ${gold}; }
    .details { font-size: 23px; color: #fff; line-height: 1.5; margin-top: 8px; }
    .details b { color: ${gold}; }
    .qr-slot { text-align: center; }
    .qr-img { width: 140px; height: 140px; background: #fff; padding: 9px; border-radius: 8px; }
    .qr-caption { font-size: 16px; color: rgba(255,255,255,0.85); margin-top: 6px; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  ${hostImg ? `<div class="hero-photo"></div><div class="scrim"></div>` : ""}
  <div class="content">
    ${kicker ? `<div class="kicker">${kicker}</div>` : ""}
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    ${host ? `<div class="who"><div class="who-name">${escapeHtml(host.name || "")}</div>${host.title ? `<div class="who-title">${escapeHtml(host.title)}</div>` : ""}</div>` : ""}
    <div class="footer">
      <div>
        ${cta ? `<div class="cta">${cta}</div>` : ""}
        <div class="details">${details}</div>
      </div>
      ${qrDataUrl ? `<div class="qr-slot"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div></div>` : ""}
    </div>
  </div>
</body></html>`;
};

module.exports = { meta, render };
