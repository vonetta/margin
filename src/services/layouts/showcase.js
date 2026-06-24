const { escapeHtml, hexToRgba, DIMENSIONS, resolveColors, resolveFonts } = require("./shared");

const meta = {
  name: "Showcase",
  description: "An even grid of speaker faces, flat hierarchy. Panels and multi-speaker conferences.",
  suits_tones: ["formal", "energetic"],
  needs_host: false,
  ideal_speakers: "3-6",
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
  const { primary, accent, gold } = resolveColors(branding);
  const { display, body, accent: accentFont } = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const cta = escapeHtml(content.cta || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  // host is treated as the first card if present
  const allPeople = [];
  if (host) allPeople.push({ ...host, isHost: true });
  speakers.forEach((s) => allPeople.push(s));

  const cards = allPeople
    .map((p) => {
      const img = p.cutout_url || p.headshot_url;
      const photo = img
        ? `<div class="sp-photo" style="background-image:url('${img}')"></div>`
        : `<div class="sp-photo sp-empty">${escapeHtml((p.name || "?").charAt(0))}</div>`;
      return `<div class="sp">${photo}<div class="sp-meta">${p.title ? `<div class="sp-pre">${escapeHtml(p.title)}</div>` : ""}<div class="sp-name">${escapeHtml(p.name || "")}</div>${p.isHost ? `<div class="sp-tag">Host</div>` : ""}</div></div>`;
    })
    .join("");

  const cols = allPeople.length <= 4 ? 2 : 3;

  const details = [dateLine, location, cost].filter(Boolean).join(" · ");

  const bgStyle = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.6)}, ${hexToRgba(primary, 0.8)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(160deg, ${primary} 0%, ${hexToRgba(primary, 0.9)} 100%);`;

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; ${bgStyle} }
    .wrap { height: 100%; display: flex; flex-direction: column; padding: 60px 60px 50px; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: 70px; color: #fff; text-align: center; line-height: 1; text-shadow: 0 2px 20px rgba(0,0,0,0.4); }
    .subtitle { font-family: '${accentFont}', cursive; font-size: 50px; color: ${gold}; text-align: center; margin-top: 4px; }
    .slabel { text-align: center; font-size: 19px; letter-spacing: 0.2em; text-transform: uppercase; color: ${gold}; font-weight: 600; margin: 26px 0 22px; }
    .speakers { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 26px 32px; flex: 1; align-content: center; }
    .sp { display: flex; gap: 18px; align-items: center; }
    .sp-photo { width: 150px; height: 180px; flex-shrink: 0; border-radius: 10px; background-size: cover; background-position: center top; border: 3px solid ${gold}; }
    .sp-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(gold, 0.2)}; color: #fff; font-size: 54px; font-family: '${display}', serif; }
    .sp-pre { font-family: '${accentFont}', cursive; font-size: 28px; color: ${gold}; line-height: 0.9; }
    .sp-name { font-family: '${display}', serif; font-size: 32px; font-weight: 700; color: #fff; margin-top: 2px; }
    .sp-tag { font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: ${gold}; margin-top: 4px; }
    .footer { display: flex; justify-content: space-between; align-items: center; gap: 30px; padding-top: 26px; border-top: 1px solid ${hexToRgba(gold, 0.3)}; }
    .cta { font-family: '${display}', serif; font-size: 40px; font-weight: 700; color: ${gold}; }
    .details { font-size: 21px; color: #fff; margin-top: 6px; }
    .qr-img { width: 140px; height: 140px; background: #fff; padding: 9px; border-radius: 8px; }
    .qr-caption { font-size: 16px; color: rgba(255,255,255,0.85); text-align: center; margin-top: 6px; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="wrap">
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    <div class="slabel">Featuring</div>
    <div class="speakers">${cards}</div>
    <div class="footer">
      <div>${cta ? `<div class="cta">${cta}</div>` : ""}${details ? `<div class="details">${details}</div>` : ""}</div>
      ${qrDataUrl ? `<div><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div></div>` : ""}
    </div>
  </div>
</body></html>`;
};

module.exports = { meta, render };