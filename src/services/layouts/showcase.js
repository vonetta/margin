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
  name: "Showcase",
  description: "An even grid of speaker faces, flat hierarchy. Panels and multi-speaker conferences.",
  suits_tones: ["formal", "energetic"],
  needs_host: false,
  ideal_speakers: "3-6",
};

const render = ({
  size = "social",
  dims: providedDims = null,
  typography,
  branding = {},
  content = {},
  host = null,
  speakers = [],
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
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
  const logo = renderLogo(branding.logo_url);

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
      return `<div class="sp">${photo}<div class="sp-meta">${renderRibbon(p.isHost ? "HOST" : "SPEAKER", p.isHost ? gold : hexToRgba(gold, 0.85), primary)}${p.title ? `<div class="sp-pre">${escapeHtml(p.title)}</div>` : ""}<div class="sp-name">${escapeHtml(p.name || "")}</div></div></div>`;
    })
    .join("");

  const cols = allPeople.length <= 4 ? 2 : 3;

  const pills = [
    renderPill({ label: "When", value: dateLine, accent: gold }),
    renderPill({ label: "Where", value: location, accent: gold }),
    renderPill({ label: "Cost", value: cost, accent: gold }),
  ]
    .filter(Boolean)
    .join("");

  const bgStyle = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.6)}, ${hexToRgba(primary, 0.8)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold })};`;

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; display: flex; flex-direction: column; ${bgStyle} }
    .wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 50px 60px 0; }
    .top-bar { margin-bottom: 18px; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: 64px; color: #fff; text-align: center; line-height: 1; text-shadow: 0 4px 30px rgba(0,0,0,0.55); }
    .subtitle { font-family: '${accentFont}', cursive; font-size: 44px; color: ${gold}; text-align: center; margin-top: 4px; text-shadow: 0 2px 12px rgba(0,0,0,0.4); }
    .slabel { text-align: center; font-size: 18px; letter-spacing: 0.18em; text-transform: uppercase; color: ${gold}; font-weight: 700; margin: 22px 0 18px; }
    .speakers { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 22px 28px; flex: 1; align-content: center; }
    .sp { display: flex; gap: 16px; align-items: center; }
    .sp-photo { width: 140px; height: 168px; flex-shrink: 0; border-radius: 12px; background-size: cover; background-position: center top; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
    .sp-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(gold, 0.25)}; color: #fff; font-size: 50px; font-family: '${display}', serif; }
    .ribbon { display: inline-block; padding: 4px 12px; border-radius: 16px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
    .sp-pre { font-family: '${accentFont}', cursive; font-size: 24px; color: ${gold}; line-height: 0.9; }
    .sp-name { font-family: '${display}', serif; font-size: 28px; font-weight: 700; color: #fff; margin-top: 2px; }
    .pills { display: flex; gap: 14px; padding-top: 24px; border-top: 1px solid ${hexToRgba(gold, 0.3)}; }
    .pill { flex: 1; border: 2px solid; border-radius: 10px; padding: 10px 16px; }
    .pill-label { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .pill-value { font-size: 20px; font-weight: 600; margin-top: 1px; }
    .footer { display: flex; justify-content: space-between; align-items: center; gap: 30px; background: ${primary}; margin: 0 -60px; padding: 28px 60px 44px; border-top: 4px solid ${gold}; }
    .cta { font-family: '${display}', serif; font-size: 32px; font-weight: 700; color: ${gold}; text-transform: uppercase; }
    .qr-img { width: 130px; height: 130px; background: #fff; padding: 8px; border-radius: 8px; }
    .qr-caption { font-size: 15px; color: rgba(255,255,255,0.85); text-align: center; margin-top: 6px; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="wrap">
    ${logo ? `<div class="top-bar">${logo}</div>` : ""}
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    <div class="slabel">Featuring</div>
    <div class="speakers">${cards}</div>
    <div class="pills">${pills}</div>
  </div>
  <div class="footer">
    ${cta ? `<div class="cta">${cta}</div>` : "<div></div>"}
    ${qrDataUrl ? `<div><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div></div>` : ""}
  </div>
</body></html>`;
};

module.exports = { meta, render };
