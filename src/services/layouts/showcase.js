const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  brandGradient,
  renderRibbon,
  resolveStyledTheme,
  resolveLogo,
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
  style = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
  const { s, primary, accent, gold, display, body, accentFont } =
    resolveStyledTheme(branding, typography, style);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const description = escapeHtml(content.description || "");
  const themeTags = Array.isArray(content.theme_tags) ? content.theme_tags : [];
  const highlights = Array.isArray(content.highlights) ? content.highlights : [];
  const audience = escapeHtml(content.audience || "");
  const cta = escapeHtml(content.cta || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const logoInFooter = s.logo_placement === "footer-left" || s.logo_placement === "footer-right";
  const { logo, footerLogoNeedsInvert } = resolveLogo(branding, s, {
    safePlacements: logoInFooter ? [] : ["top-left", "top-center"],
  });

  // host is treated as the first card if present
  const allPeople = [];
  if (host) allPeople.push({ ...host, isHost: true });
  speakers.forEach((p) => allPeople.push(p));
  const hasPeople = allPeople.length > 0;

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

  const metaItems = [
    dateLine && { label: "When", value: dateLine },
    location && { label: "Where", value: location },
    cost && { label: "Cost", value: cost },
    audience && { label: "For", value: audience },
  ].filter(Boolean);

  const pills = metaItems
    .map(
      (m) =>
        `<div class="pill" style="border-color:${gold};"><div class="pill-label" style="color:${gold};">${escapeHtml(m.label)}</div><div class="pill-value" style="color:#fff;">${m.value}</div></div>`,
    )
    .join("");

  const overlayAlpha = s.gradient_overlay_opacity / 100;
  const bgStyle = backgroundUrl
    ? `background-image: ${overlayAlpha > 0 ? `${brandGradient({ primary, accent, gold }, s.gradient_angle, overlayAlpha)}, ` : ""}linear-gradient(${hexToRgba(primary, 0.6)}, ${hexToRgba(primary, 0.8)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold }, s.gradient_angle)};`;

  const tagPills =
    themeTags.length && s.tags_visible
      ? `<div class="tag-row">${themeTags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

  const showDescription = description && s.description_visible;

  const highlightBlock = highlights.length
    ? `<div class="highlights">${highlights
        .map((h) => `<div class="highlight-item"><span class="highlight-mark">✓</span>${escapeHtml(h)}</div>`)
        .join("")}</div>`
    : "";

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${dims.width}px; height: ${dims.height}px; }
    body { font-family: '${body}', sans-serif; overflow: hidden; display: flex; flex-direction: column; ${bgStyle} }
    .logo-backing { display: inline-flex; align-items: center; justify-content: center; }
    .logo-backing-circle { background: #fff; border-radius: 50%; padding: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .logo-backing-pill { background: #fff; border-radius: 999px; padding: 8px 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 50px 60px 0; ${hasPeople ? "" : "justify-content: center;"} }
    .top-bar { margin-bottom: 18px; }
    .top-bar-center { text-align: center; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: ${s.title_size}px; color: #fff; text-align: center; line-height: 1; text-shadow: 0 4px 30px rgba(0,0,0,0.55); }
    .subtitle { font-family: '${accentFont}', cursive; font-size: ${s.subtitle_size}px; color: ${gold}; text-align: center; margin-top: 4px; text-shadow: 0 2px 12px rgba(0,0,0,0.4); }
    .tag-row { margin-top: 18px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .tag-pill { display: inline-block; padding: 6px 16px; border-radius: 20px; border: 1.5px solid rgba(255,255,255,0.6); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .desc { font-size: ${s.description_size}px; line-height: 1.5; color: rgba(255,255,255,0.88); font-style: italic; margin-top: 16px; max-width: 560px; text-align: center; margin-left: auto; margin-right: auto; }
    .highlights { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px; margin-top: 18px; }
    .highlight-item { font-size: 16px; color: #fff; font-weight: 600; }
    .highlight-mark { color: ${gold}; font-weight: 700; }
    .slabel { text-align: center; font-size: 18px; letter-spacing: 0.18em; text-transform: uppercase; color: ${gold}; font-weight: 700; margin: 22px 0 18px; }
    .speakers { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 22px 28px; flex: 1; align-content: center; }
    .sp { display: flex; gap: 16px; align-items: center; }
    .sp-photo { width: 140px; height: 168px; flex-shrink: 0; border-radius: 12px; background-size: cover; background-position: center top; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
    .sp-empty { display: flex; align-items: center; justify-content: center; background: ${hexToRgba(gold, 0.25)}; color: #fff; font-size: 50px; font-family: '${display}', serif; }
    .ribbon { display: inline-block; padding: 4px 12px; border-radius: 16px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
    .sp-pre { font-family: '${accentFont}', cursive; font-size: 24px; color: ${gold}; line-height: 0.9; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
    .sp-name { font-family: '${display}', serif; font-size: 28px; font-weight: 700; color: #fff; margin-top: 2px; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
    .pills { display: flex; gap: 14px; padding-top: 24px; border-top: 1px solid ${hexToRgba(gold, 0.3)}; flex-wrap: wrap; }
    .pill { flex: 1; min-width: 140px; border: 2px solid; border-radius: 10px; padding: 10px 16px; }
    .pill-label { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .pill-value { font-size: 20px; font-weight: 600; margin-top: 1px; }
    .footer { display: flex; align-items: center; justify-content: space-between; gap: 30px; background: ${primary}; padding: 28px 60px 44px; border-top: 4px solid ${gold}; }
    ${footerLogoNeedsInvert ? ".footer-logo .logo { filter: brightness(0) invert(1); }" : ""}
    .footer-left { display: flex; align-items: center; gap: 16px; }
    .cta { font-family: '${display}', serif; font-size: ${Math.round(s.cta_size * 0.85)}px; font-weight: 700; color: ${gold}; text-transform: uppercase; }
    .qr-img { width: 130px; height: 130px; background: #fff; padding: 8px; border-radius: 8px; }
    .qr-caption { font-size: 15px; color: rgba(255,255,255,0.85); text-align: center; margin-top: 6px; }
    .photo-corner-logo { position: absolute; top: 20px; right: 20px; z-index: 4; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  ${s.logo_placement === "photo-corner" && logo ? `<div class="photo-corner-logo">${logo}</div>` : ""}
  <div class="wrap">
    ${
      !logoInFooter && s.logo_placement !== "photo-corner" && logo
        ? `<div class="top-bar${s.logo_placement === "top-center" ? " top-bar-center" : ""}">${logo}</div>`
        : ""
    }
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    ${tagPills}
    ${showDescription ? `<div class="desc">${description}</div>` : ""}
    ${highlightBlock}
    ${hasPeople ? `<div class="slabel">Featuring</div><div class="speakers">${cards}</div>` : ""}
    <div class="pills">${pills}</div>
  </div>
  <div class="footer">
    <div class="footer-left">
      ${logoInFooter && logo ? `<div class="footer-logo">${logo}</div>` : ""}
      ${cta ? `<div class="cta">${cta}</div>` : "<div></div>"}
    </div>
    ${qrDataUrl ? `<div><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div></div>` : ""}
  </div>
</body></html>`;
};

module.exports = { meta, render };
