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
  name: "Monument",
  description:
    "Host portrait beside the title, speaker row below. Formal events with a host and guest speakers.",
  suits_tones: ["formal", "classic"],
  needs_host: false,
  ideal_speakers: "1-3",
};

const speakerColumns = (count) => {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 4) return 2;
  return 3;
};

const render = ({
  size = "social",
  typography,
  branding = {},
  content = {},
  host = null,
  speakers = [],
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
}) => {
  const dims = DIMENSIONS[size] || DIMENSIONS.social;
  const { primary, accent, gold, bg } = resolveColors(branding);
  const { display, body, accent: accentFont } = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const cta = escapeHtml(content.cta || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");

  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";
  const logo = renderLogo(branding.logo_url);

  const hostImg = host && (host.cutout_url || host.headshot_url);
  const heroBlock = hostImg
    ? `<div class="hero">
         <div class="hero-photo" style="background-image:url('${host.cutout_url || host.headshot_url}')"></div>
         ${renderRibbon("HOST", gold, primary)}
         <div class="hero-tag">
           <div class="hero-name">${escapeHtml(host.name || "")}</div>
           ${host.title ? `<div class="hero-title">${escapeHtml(host.title)}</div>` : ""}
         </div>
       </div>`
    : "";

  const speakerCards = speakers
    .map((s) => {
      const img = s.cutout_url || s.headshot_url;
      const photo = img
        ? `<div class="sp-photo" style="background-image:url('${img}')"></div>`
        : `<div class="sp-photo sp-empty">${escapeHtml((s.name || "?").charAt(0))}</div>`;
      return `<div class="sp-card">${photo}
        ${renderRibbon("SPEAKER", hexToRgba(gold, 0.92), primary)}
        ${s.title ? `<div class="sp-pre">${escapeHtml(s.title)}</div>` : ""}
        <div class="sp-name">${escapeHtml(s.name || "")}</div></div>`;
    })
    .join("");

  const speakerBlock = speakers.length
    ? `<div class="slabel">Featuring Guest Speakers</div>
       <div class="speakers" style="grid-template-columns: repeat(${speakerColumns(speakers.length)}, 1fr)">${speakerCards}</div>`
    : "";

  const pills = [
    renderPill({ label: "When", value: dateLine, accent: gold }),
    renderPill({ label: "Where", value: location, accent: gold }),
    renderPill({ label: "Cost", value: cost, accent: gold }),
  ]
    .filter(Boolean)
    .join("");

  const qrBlock = qrDataUrl
    ? `<div class="qr-slot"><img src="${qrDataUrl}" class="qr-img" alt="QR" /><div class="qr-caption">${qrCaption}</div></div>`
    : "";

  // Background: real photo if provided, else a bold brand-color gradient
  // (the new default — see shared.js for why abstract AI art was dropped).
  const bgStyle = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.55)}, ${hexToRgba(primary, 0.75)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold })};`;

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; display: flex; flex-direction: column; ${bgStyle} }
    .wrap { width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 56px 70px 0; }
    .top-bar { display: flex; align-items: center; margin-bottom: 28px; }
    .logo { display: block; }
    .header { display: flex; gap: 40px; align-items: flex-start; }
    .header-text { flex: 1; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: ${hostImg ? "66px" : "84px"}; line-height: 1.0; color: #fff; text-shadow: 0 4px 30px rgba(0,0,0,0.55); }
    .subtitle { font-size: 27px; line-height: 1.4; color: ${gold}; margin-top: 18px; font-style: italic; max-width: 520px; text-shadow: 0 2px 12px rgba(0,0,0,0.4); }
    .hero { width: 300px; flex-shrink: 0; text-align: center; }
    .hero-photo { width: 280px; height: 340px; border-radius: 14px; background-size: cover; background-position: center top; margin: 0 auto; box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
    .ribbon { display: inline-block; margin-top: 12px; padding: 5px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .hero-tag { margin-top: 8px; }
    .hero-name { font-family: '${display}', serif; font-size: 32px; font-weight: 700; color: #fff; margin-top: 4px; }
    .hero-title { font-size: 18px; color: rgba(255,255,255,0.85); margin-top: 2px; }
    .body-zone { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 32px; }
    .slabel { text-align: center; font-size: 19px; letter-spacing: 0.14em; text-transform: uppercase; color: ${gold}; font-weight: 700; }
    .speakers { display: grid; gap: 24px; margin-top: 14px; }
    .sp-card { text-align: center; }
    .sp-photo { width: 100%; aspect-ratio: 0.85; border-radius: 12px; background-size: cover; background-position: center top; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
    .sp-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(gold, 0.25)}; color: #fff; font-size: 56px; font-family: '${display}', serif; }
    .sp-pre { font-family: '${accentFont}', cursive; font-size: 24px; color: ${gold}; margin-top: 8px; line-height: 0.9; }
    .sp-name { font-family: '${display}', serif; font-size: 25px; font-weight: 700; color: #fff; }
    .pills { display: flex; flex-direction: column; gap: 14px; }
    .pill { border: 2px solid; border-radius: 12px; padding: 12px 20px; }
    .pill-label { font-size: 14px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .pill-value { font-size: 26px; font-weight: 600; margin-top: 2px; }
    .footer { background: ${primary}; margin: 0 -70px; padding: 36px 70px 52px; display: flex; justify-content: space-between; align-items: center; gap: 30px; border-top: 4px solid ${gold}; }
    .cta { font-family: '${display}', serif; font-size: 38px; font-weight: 700; color: ${gold}; text-transform: uppercase; letter-spacing: 0.02em; }
    .qr-slot { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .qr-img { width: 140px; height: 140px; background: #fff; padding: 9px; border-radius: 10px; }
    .qr-caption { font-size: 16px; color: rgba(255,255,255,0.85); font-weight: 500; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="wrap">
    ${logo ? `<div class="top-bar">${logo}</div>` : ""}
    <div class="header">
      <div class="header-text">
        <div class="title">${title}</div>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
      </div>
      ${heroBlock}
    </div>
    <div class="body-zone">
      ${speakerBlock}
      <div class="pills">${pills}</div>
    </div>
  </div>
  <div class="footer">
    ${cta ? `<div class="cta">${cta}</div>` : "<div></div>"}
    ${qrBlock}
  </div>
</body></html>`;
};

module.exports = { meta, render };
