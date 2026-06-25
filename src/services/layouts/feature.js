const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
  brandGradient,
  renderPill,
  renderRibbon,
  renderLogo,
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
  dims: providedDims = null,
  typography,
  branding = {},
  content = {},
  host = null,
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
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
  const logo = renderLogo(branding.logo_url);

  const hostImg = host && (host.cutout_url || host.headshot_url);

  const bgStyle = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.7)}, ${hexToRgba(primary, 0.85)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold }, 165)};`;

  const pills = [
    renderPill({ label: "When", value: dateLine, accent: gold }),
    renderPill({ label: "Where", value: location, accent: gold }),
    renderPill({ label: "Cost", value: cost, accent: gold }),
  ]
    .filter(Boolean)
    .join("");

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; ${bgStyle} }
    .hero-photo { position: absolute; right: 0; bottom: 0; width: 62%; height: 88%; background-image: url('${hostImg || ""}'); background-size: cover; background-position: center top; }
    .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, ${primary} 30%, ${hexToRgba(primary, 0.5)} 55%, ${hexToRgba(primary, 0)} 75%); }
    .content { position: relative; z-index: 3; padding: 56px 60px; height: 100%; display: flex; flex-direction: column; width: 64%; }
    .top-bar { margin-bottom: 24px; }
    .kicker { font-family: '${accentFont}', cursive; font-size: 52px; color: ${gold}; line-height: 0.9; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: 88px; line-height: 0.98; color: #fff; margin-top: 8px; text-shadow: 0 4px 30px rgba(0,0,0,0.55); }
    .subtitle { font-size: 26px; line-height: 1.45; color: rgba(255,255,255,0.92); margin-top: 22px; max-width: 440px; font-style: italic; }
    .who { margin-top: 30px; }
    .ribbon { display: inline-block; padding: 5px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
    .who-name { font-family: '${display}', serif; font-size: 46px; font-weight: 700; color: #fff; }
    .who-title { font-size: 21px; color: ${gold}; margin-top: 2px; }
    .footer { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
    .footer-left { flex: 1; }
    .cta { display: inline-block; font-family: '${display}', serif; font-size: 28px; font-weight: 700; color: ${gold}; text-transform: uppercase; margin-bottom: 16px; background: rgba(0,0,0,0.4); padding: 10px 18px; border-radius: 8px; }
    .pills { display: flex; flex-direction: column; gap: 10px; max-width: 380px; }
    .pill { border: 2px solid; border-radius: 10px; padding: 9px 16px; }
    .pill-label { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .pill-value { font-size: 21px; font-weight: 600; margin-top: 1px; }
    .qr-slot { text-align: center; }
    .qr-img { width: 130px; height: 130px; background: #fff; padding: 8px; border-radius: 8px; }
    .qr-caption { font-size: 15px; color: rgba(255,255,255,0.85); margin-top: 6px; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  ${hostImg ? `<div class="hero-photo"></div><div class="scrim"></div>` : ""}
  <div class="content">
    ${logo ? `<div class="top-bar">${logo}</div>` : ""}
    ${kicker ? `<div class="kicker">${kicker}</div>` : ""}
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    ${
      host
        ? `<div class="who">${renderRibbon(host.title ? "FEATURED SPEAKER" : "HOST", gold, primary)}<div class="who-name">${escapeHtml(host.name || "")}</div>${host.title ? `<div class="who-title">${escapeHtml(host.title)}</div>` : ""}</div>`
        : ""
    }
    <div class="footer">
      <div class="footer-left">
        ${cta ? `<div class="cta">${cta}</div>` : ""}
        <div class="pills">${pills}</div>
      </div>
      ${qrDataUrl ? `<div class="qr-slot"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div></div>` : ""}
    </div>
  </div>
</body></html>`;
};

module.exports = { meta, render };
