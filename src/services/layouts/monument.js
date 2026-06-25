const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
  brandGradient,
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
  const { primary, accent, gold, bg, text } = resolveColors(branding);
  const { display, body, accent: accentFont } = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const description = escapeHtml(content.description || "");
  const themeTags = Array.isArray(content.theme_tags) ? content.theme_tags : [];
  const audience = escapeHtml(content.audience || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const cta = escapeHtml(content.cta || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");

  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";
  const logo = renderLogo(branding.logo_url, 56);

  const hostImg = host && (host.cutout_url || host.headshot_url);
  const hasSpeakers = speakers.length > 0;
  const speakerCount = speakers.length;
  const speakerSize = speakerCount <= 2 ? 200 : speakerCount === 3 ? 170 : 150;

  // Two-zone composition: a light "paper" panel carries the title, a
  // darker brand-color panel on the right carries the host photo, divided
  // by a gold border seam — matching the reference flyers' photo-vs-
  // content split instead of one flat full-bleed canvas. The whole page
  // is a single flex column (top zone, then speakers/details, then
  // footer) so nothing needs hand-tuned pixel offsets that break when
  // content length changes.
  const photoZoneBg = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.35)}, ${hexToRgba(primary, 0.55)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold }, 165)};`;

  const speakerCards = speakers
    .map((s) => {
      const img = s.cutout_url || s.headshot_url;
      const photo = img
        ? `<div class="sp-photo" style="background-image:url('${img}')"></div>`
        : `<div class="sp-photo sp-empty">${escapeHtml((s.name || "?").charAt(0))}</div>`;
      return `<div class="sp-card" style="width:${speakerSize}px;">${photo}
        ${s.title ? `<div class="sp-pre">${escapeHtml(s.title)}</div>` : ""}
        <div class="sp-name">${escapeHtml(s.name || "")}</div></div>`;
    })
    .join("");

  const speakerBlock = speakers.length
    ? `<div class="slabel-row"><span class="slabel-line"></span><span class="slabel">Featuring Guest Speakers</span><span class="slabel-line"></span></div>
       <div class="speakers">${speakerCards}</div>`
    : "";

  const metaItems = [
    dateLine && { icon: "📅", label: "When", value: dateLine },
    location && { icon: "📍", label: "Where", value: location },
    cost && { icon: "💰", label: "Cost", value: cost },
    audience && { icon: "👥", label: "For", value: audience },
  ].filter(Boolean);

  const tagPills = themeTags.length
    ? `<div class="tag-row">${themeTags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('<span class="tag-dot">•</span>')}</div>`
    : "";

  const metaRow = metaItems.length
    ? `<div class="meta-row">${metaItems
        .map(
          (m, i) => `${i > 0 ? '<span class="meta-divider"></span>' : ""}<div class="meta-item"><span class="meta-icon">${m.icon}</span><div><div class="meta-label">${escapeHtml(m.label)}</div><div class="meta-value">${m.value}</div></div></div>`,
        )
        .join("")}</div>`
    : "";

  const qrBlock = qrDataUrl
    ? `<div class="qr-slot"><img src="${qrDataUrl}" class="qr-img" alt="QR" /><div class="qr-caption">${qrCaption}</div></div>`
    : "";

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; display: flex; flex-direction: column; background: ${bg}; }
    .top-zone { position: relative; ${hasSpeakers ? "flex: 0 0 auto; min-height: 520px;" : "flex: 1; min-height: 0;"} }
    .photo-zone { position: absolute; top: 0; right: 0; bottom: 0; width: 44%; border-left: 6px solid ${gold}; box-shadow: -10px 0 30px rgba(0,0,0,0.18); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; ${photoZoneBg} }
    .host-circle-wrap { position: relative; display: inline-block; }
    .host-circle-wrap .ribbon { position: absolute; top: -6px; right: -16px; }
    .host-circle { width: 230px; height: 230px; border-radius: 50%; border: 6px solid #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.35); background-size: cover; background-position: center top; background-color: ${hexToRgba("#ffffff", 0.15)}; display: flex; align-items: center; justify-content: center; font-size: 72px; color: #fff; font-family: '${display}', serif; }
    .content { position: relative; z-index: 2; padding: 48px 56px 36px; width: 58%; }
    .top-bar { margin-bottom: 26px; }
    .title { font-family: '${display}', serif; font-weight: 800; font-size: 70px; line-height: 1.0; color: ${primary}; text-transform: uppercase; }
    .subtitle-script { font-family: '${accentFont}', cursive; font-size: 48px; color: ${accent}; line-height: 1; margin-top: 8px; }
    .desc { font-size: 18px; line-height: 1.5; color: ${hexToRgba(text, 0.85)}; font-style: italic; margin-top: 16px; max-width: 380px; }
    .tag-row { margin-top: 18px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; }
    .tag-pill { color: ${primary}; text-transform: uppercase; }
    .tag-dot { color: ${gold}; margin: 0 8px; }
    .ribbon { display: inline-block; padding: 6px 18px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .host-role { font-family: '${accentFont}', cursive; font-size: 24px; color: ${gold}; line-height: 1; text-align: center; }
    .host-name { font-family: '${display}', serif; font-size: 28px; font-weight: 800; color: #fff; text-transform: uppercase; line-height: 1.1; text-align: center; }
    .mid-zone { ${hasSpeakers ? "flex: 1; min-height: 0;" : "flex: 0 0 auto;"} overflow: hidden; padding: 28px 56px; background: ${bg}; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
    .slabel-row { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
    .slabel-line { flex: 1; height: 1px; background: ${hexToRgba(gold, 0.7)}; }
    .slabel { font-size: 16px; letter-spacing: 0.12em; text-transform: uppercase; color: ${primary}; font-weight: 700; white-space: nowrap; }
    .speakers { display: flex; gap: 26px; justify-content: center; }
    .sp-card { text-align: center; flex: 0 0 auto; }
    .sp-photo { width: 100%; aspect-ratio: 1; border-radius: 50%; background-size: cover; background-position: center top; border: 5px solid ${hexToRgba(gold, 0.85)}; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
    .sp-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(primary, 0.12)}; color: ${primary}; font-size: 44px; font-family: '${display}', serif; }
    .sp-pre { font-family: '${accentFont}', cursive; font-size: 19px; color: ${accent}; margin-top: 10px; line-height: 0.9; }
    .sp-name { font-family: '${display}', serif; font-size: 18px; font-weight: 800; color: ${primary}; text-transform: uppercase; }
    .meta-row { display: flex; align-items: center; justify-content: center; gap: 22px; padding: 18px 0; border-top: 1px solid ${hexToRgba(primary, 0.18)}; border-bottom: 1px solid ${hexToRgba(primary, 0.18)}; }
    .meta-item { display: flex; align-items: center; gap: 10px; }
    .meta-icon { width: 36px; height: 36px; border-radius: 50%; background: ${primary}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
    .meta-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${accent}; }
    .meta-value { font-size: 18px; font-weight: 700; color: ${primary}; }
    .meta-divider { width: 1px; height: 30px; background: ${hexToRgba(primary, 0.2)}; }
    .footer { flex: 0 0 auto; background: ${primary}; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 28px 56px; border-top: 4px solid ${gold}; }
    .cta { font-family: '${display}', serif; font-size: 34px; font-weight: 800; color: ${gold}; text-transform: uppercase; line-height: 1.15; }
    .qr-slot { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
    .qr-img { width: 116px; height: 116px; background: #fff; padding: 7px; border-radius: 8px; }
    .qr-caption { font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="top-zone">
    <div class="photo-zone">
      ${
        host
          ? `<div class="host-circle-wrap">
               <div class="host-circle" ${hostImg ? `style="background-image:url('${hostImg}')"` : ""}>${hostImg ? "" : escapeHtml((host.name || "?").charAt(0))}</div>
               ${renderRibbon("HOST", gold, primary)}
             </div>
             <div class="host-role">${host.title ? escapeHtml(host.title) : ""}</div>
             <div class="host-name">${escapeHtml(host.name || "")}</div>`
          : ""
      }
    </div>
    <div class="content">
      ${logo ? `<div class="top-bar">${logo}</div>` : ""}
      <div class="title">${title}</div>
      ${subtitle ? `<div class="subtitle-script">${subtitle}</div>` : ""}
      ${tagPills}
      ${description ? `<div class="desc">${description}</div>` : ""}
    </div>
  </div>
  <div class="mid-zone">
    ${speakerBlock}
    ${metaRow}
  </div>
  <div class="footer">
    ${cta ? `<div class="cta">${cta}</div>` : "<div></div>"}
    ${qrBlock}
  </div>
</body></html>`;
};

module.exports = { meta, render };
