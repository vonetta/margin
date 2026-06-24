const DIMENSIONS = {
  social: { width: 1080, height: 1350 },
  print: { width: 1275, height: 1650 },
};

const LAYOUTS = {
  formal: "monument",
  classic: "monument",
  warm: "aurora",
  energetic: "bold",
};

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

// Decide speaker grid columns based on count
const speakerColumns = (count) => {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 4) return 2;
  return 3; // 3, 5, 6+
};

const buildSpeakerCards = ({
  speakers = [],
  primary,
  gold,
  accent,
  displayFont,
  bodyFont,
}) => {
  if (!speakers.length) return "";

  const cards = speakers
    .map((s) => {
      const name = escapeHtml(s.name || "");
      const title = escapeHtml(s.title || "");
      const img = s.headshot_url
        ? `<div class="sp-photo" style="background-image:url('${s.headshot_url}')"></div>`
        : `<div class="sp-photo sp-photo-empty">${escapeHtml((s.name || "?").charAt(0))}</div>`;
      return `<div class="sp-card">
        ${img}
        <div class="sp-name">${name}</div>
        ${title ? `<div class="sp-title">${title}</div>` : ""}
      </div>`;
    })
    .join("");

  const cols = speakerColumns(speakers.length);
  return `<div class="speakers" style="grid-template-columns: repeat(${cols}, 1fr)">${cards}</div>`;
};

const buildFlyerHtml = ({
  size = "social",
  typography,
  branding = {},
  content = {},
  host = null,
  speakers = [],
  qrDataUrl = null,
  fontsUrl = null,
}) => {
  const dims = DIMENSIONS[size] || DIMENSIONS.social;
  const colors = branding.colors || {};
  const primary = colors.primary || "#1a1a2e";
  const accent = colors.accent || "#e94560";
  const gold = colors.gold || "#f5a623";
  const bg = colors.background || "#ffffff";

  const displayFont = typography?.display?.name || "Georgia";
  const bodyFont = typography?.body?.name || "Helvetica";
  const accentFont = typography?.accent?.name || displayFont;

  const layout = LAYOUTS[typography?.tone] || "monument";

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const cta = escapeHtml(content.cta || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");

  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const hasHost = host && host.headshot_url;
  const heroBlock = hasHost
    ? `<div class="hero-photo" style="background-image:url('${host.headshot_url}')"></div>
         <div class="hero-tag">
           ${host.role ? `<div class="hero-role">${escapeHtml(host.role)}</div>` : ""}
           <div class="hero-name">${escapeHtml(host.name || "")}</div>
           ${host.title ? `<div class="hero-title">${escapeHtml(host.title)}</div>` : ""}
         </div>`
    : "";

  const speakerBlock = buildSpeakerCards({
    speakers,
    primary,
    gold,
    accent,
    displayFont,
    bodyFont,
  });

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

  const layoutStyles = {
    monument: `
        body { background: ${bg}; }
        .header { background: linear-gradient(160deg, ${primary} 0%, ${hexToRgba(primary, 0.9)} 100%); padding: 80px 70px 70px; }
        .title { color: #fff; }
        .subtitle { color: ${gold}; }
        .hero { position: relative; }
        .hero-photo { border: 4px solid ${gold}; }
        .hero-name { color: #fff; }
        .hero-role { color: ${gold}; }
        .hero-title { color: ${hexToRgba(gold, 0.85)}; }
        .body-zone { padding: 50px 70px; }
        .footer { background: ${primary}; }
        .footer .cta { color: ${gold}; }
        .footer .qr-caption { color: rgba(255,255,255,0.85); }
      `,
    aurora: `
        body { background: linear-gradient(165deg, ${bg} 0%, ${hexToRgba(accent, 0.16)} 60%, ${hexToRgba(primary, 0.2)} 100%); }
        .header { padding: 80px 70px 40px; }
        .title { color: ${primary}; }
        .subtitle { color: ${accent}; }
        .hero-photo { border: 4px solid ${accent}; }
        .hero-name { color: ${primary}; }
        .hero-role { color: ${accent}; }
        .hero-title { color: ${primary}; }
        .body-zone { padding: 40px 70px; }
        .footer { padding: 40px 70px 70px; }
        .footer .cta { color: ${primary}; }
      `,
    bold: `
        body { background: ${bg}; }
        .header { background: ${primary}; padding: 70px; }
        .title { color: #fff; }
        .subtitle { color: ${gold}; }
        .hero-photo { border: 4px solid ${accent}; }
        .hero-name { color: #fff; }
        .hero-role { color: ${gold}; }
        .hero-title { color: rgba(255,255,255,0.85); }
        .body-zone { padding: 50px 70px; border-left: 10px solid ${accent}; }
        .footer { background: ${accent}; }
        .footer .cta { color: #fff; }
        .footer .qr-caption { color: rgba(255,255,255,0.9); }
      `,
  };

  const styles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${dims.width}px; height: ${dims.height}px; }
      body { font-family: '${bodyFont}', sans-serif; display: flex; flex-direction: column; overflow: hidden; }
      .header { ${hasHost ? "display: flex; gap: 40px; align-items: center;" : ""} }
      .header-text { flex: 1; }
      .title { font-family: '${displayFont}', serif; font-size: ${hasHost ? "64px" : "82px"}; line-height: 1.05; font-weight: 600; }
      .subtitle { font-size: 28px; margin-top: 20px; font-weight: 500; line-height: 1.35; }
      .hero { width: ${hasHost ? "320px" : "0"}; flex-shrink: 0; text-align: center; }
      .hero-photo { width: 280px; height: 280px; border-radius: 50%; background-size: cover; background-position: center; margin: 0 auto; }
      .hero-tag { margin-top: 18px; }
      .hero-role { font-size: 18px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; }
      .hero-name { font-family: '${displayFont}', serif; font-size: 34px; font-weight: 600; margin-top: 4px; }
      .hero-title { font-size: 20px; margin-top: 2px; }
      .body-zone { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; }
      .speakers { display: grid; gap: 30px; }
      .sp-card { text-align: center; }
      .sp-photo { width: 100%; aspect-ratio: 1; border-radius: 12px; background-size: cover; background-position: center; border: 3px solid ${gold}; }
      .sp-photo-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(primary, 0.1)}; color: ${primary}; font-size: 60px; font-family: '${displayFont}', serif; }
      .sp-name { font-family: '${displayFont}', serif; font-size: 26px; font-weight: 600; color: ${primary}; margin-top: 14px; }
      .sp-title { font-size: 18px; color: ${accent}; margin-top: 2px; }
      .details { display: flex; flex-direction: column; gap: 18px; }
      .detail { display: flex; align-items: baseline; gap: 16px; }
      .dlabel { font-family: '${displayFont}', serif; color: ${gold}; font-size: 22px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; min-width: 110px; }
      .dval { font-size: 32px; color: ${primary}; font-weight: 500; }
      .footer { padding: 45px 70px 60px; display: flex; justify-content: space-between; align-items: center; gap: 30px; }
      .cta { font-family: '${accentFont}', cursive; font-size: 48px; }
      .qr-slot { display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .qr-img { width: 150px; height: 150px; background: #fff; padding: 10px; border-radius: 8px; }
      .qr-caption { font-size: 18px; font-weight: 500; }
      ${layoutStyles[layout]}
    `;

  return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8">
  ${fontLink}
  <style>${styles}</style>
  </head>
  <body class="layout-${layout}">
    <div class="header">
      <div class="header-text">
        <div class="title">${title}</div>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
      </div>
      ${hasHost ? `<div class="hero">${heroBlock}</div>` : ""}
    </div>
    <div class="body-zone">
      ${speakerBlock}
      <div class="details">${detailItems}</div>
    </div>
    <div class="footer">
      ${cta ? `<div class="cta">${cta}</div>` : "<div></div>"}
      ${qrBlock}
    </div>
  </body>
  </html>`;
};

module.exports = { buildFlyerHtml, DIMENSIONS, LAYOUTS, speakerColumns };
