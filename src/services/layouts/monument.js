const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
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

  const hostImg = host && (host.cutout_url || host.headshot_url);
  const heroBlock = hostImg
    ? `<div class="hero">
         <div class="hero-photo" style="background-image:url('${host.cutout_url || host.headshot_url}')"></div>
         <div class="hero-tag">
           ${host.role ? `<div class="hero-role">${escapeHtml(host.role)}</div>` : ""}
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
        ${s.title ? `<div class="sp-pre">${escapeHtml(s.title)}</div>` : ""}
        <div class="sp-name">${escapeHtml(s.name || "")}</div></div>`;
    })
    .join("");

  const speakerBlock = speakers.length
    ? `<div class="slabel">Featuring</div>
       <div class="speakers" style="grid-template-columns: repeat(${speakerColumns(speakers.length)}, 1fr)">${speakerCards}</div>`
    : "";

  const detailItems = [
    dateLine &&
      `<div class="detail"><span class="dlabel">When</span><span class="dval">${dateLine}</span></div>`,
    location &&
      `<div class="detail"><span class="dlabel">Where</span><span class="dval">${location}</span></div>`,
    cost &&
      `<div class="detail"><span class="dlabel">Cost</span><span class="dval">${cost}</span></div>`,
  ]
    .filter(Boolean)
    .join("");

  const qrBlock = qrDataUrl
    ? `<div class="qr-slot"><img src="${qrDataUrl}" class="qr-img" alt="QR" /><div class="qr-caption">${qrCaption}</div></div>`
    : "";

  // Background: AI image if provided, else navy gradient
  const bgStyle = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.55)}, ${hexToRgba(primary, 0.75)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(160deg, ${primary} 0%, ${hexToRgba(primary, 0.9)} 100%);`;

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; ${bgStyle} }
    .wrap { width: 100%; height: 100%; display: flex; flex-direction: column; padding: 80px 70px 0; }
    .header { display: flex; gap: 40px; align-items: flex-start; }
    .header-text { flex: 1; }
    .title { font-family: '${display}', serif; font-weight: 600; font-size: ${hostImg ? "64px" : "82px"}; line-height: 1.02; color: #fff; text-shadow: 0 2px 24px rgba(0,0,0,0.4); }
    .subtitle { font-size: 27px; line-height: 1.4; color: ${gold}; margin-top: 20px; font-style: italic; max-width: 520px; }
    .hero { width: 300px; flex-shrink: 0; text-align: center; }
    .hero-photo { width: 280px; height: 340px; background-size: cover; background-position: center top; margin: 0 auto; }
    .hero-tag { margin-top: 12px; }
    .hero-role { font-size: 18px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; color: ${gold}; }
    .hero-name { font-family: '${display}', serif; font-size: 34px; font-weight: 700; color: #fff; margin-top: 2px; }
    .hero-title { font-size: 19px; color: ${hexToRgba(gold, 0.9)}; margin-top: 2px; }
    .body-zone { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 36px; }
    .slabel { text-align: center; font-size: 20px; letter-spacing: 0.18em; text-transform: uppercase; color: ${gold}; font-weight: 600; }
    .speakers { display: grid; gap: 26px; }
    .sp-card { text-align: center; }
    .sp-photo { width: 100%; aspect-ratio: 0.85; border-radius: 10px; background-size: cover; background-position: center top; border: 3px solid ${gold}; }
    .sp-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(gold, 0.2)}; color: #fff; font-size: 56px; font-family: '${display}', serif; }
    .sp-pre { font-family: '${accentFont}', cursive; font-size: 26px; color: ${gold}; margin-top: 10px; line-height: 0.9; }
    .sp-name { font-family: '${display}', serif; font-size: 26px; font-weight: 600; color: #fff; }
    .details { display: flex; flex-direction: column; gap: 16px; }
    .detail { display: flex; align-items: baseline; gap: 16px; }
    .dlabel { font-family: '${display}', serif; color: ${gold}; font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; min-width: 110px; }
    .dval { font-size: 32px; color: #fff; font-weight: 500; }
    .footer { background: ${hexToRgba(primary, 0.85)}; margin: 0 -70px; padding: 40px 70px 56px; display: flex; justify-content: space-between; align-items: center; gap: 30px; }
    .cta { font-family: '${accentFont}', cursive; font-size: 50px; color: ${gold}; }
    .qr-slot { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .qr-img { width: 150px; height: 150px; background: #fff; padding: 10px; border-radius: 8px; }
    .qr-caption { font-size: 18px; color: rgba(255,255,255,0.85); font-weight: 500; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-text">
        <div class="title">${title}</div>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
      </div>
      ${heroBlock}
    </div>
    <div class="body-zone">
      ${speakerBlock}
      <div class="details">${detailItems}</div>
    </div>
  </div>
  <div class="footer">
    ${cta ? `<div class="cta">${cta}</div>` : "<div></div>"}
    ${qrBlock}
  </div>
</body></html>`;
};

module.exports = { meta, render };
