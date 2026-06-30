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
  style = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
  const { s, primary, accent, gold, display, body, accentFont } =
    resolveStyledTheme(branding, typography, style);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const kicker = escapeHtml(content.kicker || "");
  const description = escapeHtml(content.description || "");
  const themeTags = Array.isArray(content.theme_tags) ? content.theme_tags : [];
  const highlights = Array.isArray(content.highlights) ? content.highlights : [];
  const cta = escapeHtml(content.cta || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const audience = escapeHtml(content.audience || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const logoInFooter = s.logo_placement === "footer-left" || s.logo_placement === "footer-right";
  const { logo, footerLogoNeedsInvert } = resolveLogo(branding, s, {
    safePlacements: logoInFooter ? [] : ["top-left", "top-center"],
  });

  const hostImg = host && (host.cutout_url || host.headshot_url);

  // When there's no host portrait, the hero photo slot is free to hold a
  // generated/uploaded background photo instead — previously this layout
  // only ever showed a plain gradient without a host.
  const overlayAlpha = s.gradient_overlay_opacity / 100;
  const bgStyle = !hostImg && backgroundUrl
    ? `background-image: ${overlayAlpha > 0 ? `${brandGradient({ primary, accent, gold }, s.gradient_angle, overlayAlpha)}, ` : ""}linear-gradient(${hexToRgba(primary, 0.5)}, ${hexToRgba(primary, 0.7)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background: ${brandGradient({ primary, accent, gold }, s.gradient_angle)};`;

  const metaItems = [
    dateLine && { label: "When", value: dateLine },
    location && { label: "Where", value: location },
    cost && { label: "Cost", value: cost },
    audience && { label: "For", value: audience },
  ].filter(Boolean);

  const pills = metaItems
    .map(
      (m) =>
        `<div class="pill" style="border-color:${gold};background:rgba(0,0,0,0.32);"><div class="pill-label" style="color:${gold};">${escapeHtml(m.label)}</div><div class="pill-value" style="color:#fff;">${m.value}</div></div>`,
    )
    .join("");

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
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; ${bgStyle} }
    .logo-backing { display: inline-flex; align-items: center; justify-content: center; }
    .logo-backing-circle { background: #fff; border-radius: 50%; padding: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .logo-backing-pill { background: #fff; border-radius: 999px; padding: 8px 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .photo-corner-logo { position: absolute; top: 20px; right: 20px; z-index: 4; }
    .hero-photo { position: absolute; right: 0; bottom: 0; width: 62%; height: 88%; background-image: url('${hostImg || ""}'); background-size: cover; background-position: center top; }
    .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, ${primary} 30%, ${hexToRgba(primary, 0.5)} 55%, ${hexToRgba(primary, 0)} 75%); }
    .content { position: relative; z-index: 3; padding: 44px 56px; height: 100%; display: flex; flex-direction: column; width: 64%; }
    .top-bar { margin-bottom: 24px; }
    .top-bar-center { text-align: center; }
    .kicker { font-family: '${accentFont}', cursive; font-size: 52px; color: ${gold}; line-height: 0.9; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: ${s.title_size}px; line-height: 0.98; color: #fff; margin-top: 8px; text-shadow: 0 4px 30px rgba(0,0,0,0.55); }
    .subtitle { font-size: ${s.subtitle_size}px; line-height: 1.45; color: rgba(255,255,255,0.92); margin-top: 22px; max-width: 440px; font-style: italic; }
    .tag-row { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-pill { display: inline-block; padding: 6px 16px; border-radius: 20px; border: 1.5px solid rgba(255,255,255,0.6); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .desc { font-size: ${s.description_size}px; line-height: 1.5; color: rgba(255,255,255,0.85); font-style: italic; margin-top: 16px; max-width: 440px; }
    .highlights { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
    .highlight-item { font-size: 16px; color: #fff; font-weight: 500; }
    .highlight-mark { color: ${gold}; font-weight: 700; }
    .who { margin-top: 18px; }
    .ribbon { display: inline-block; padding: 5px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
    .who-name { font-family: '${display}', serif; font-size: 46px; font-weight: 700; color: #fff; }
    .who-title { font-size: 21px; color: ${gold}; margin-top: 2px; }
    .footer { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
    .footer-left { flex: 1; }
    ${footerLogoNeedsInvert ? ".footer-logo .logo { filter: brightness(0) invert(1); }" : ""}
    .footer-logo { margin-bottom: 16px; }
    .cta { display: inline-block; font-family: '${display}', serif; font-size: ${Math.round(s.cta_size * 0.9)}px; font-weight: 700; color: ${gold}; text-transform: uppercase; margin-bottom: 16px; background: rgba(0,0,0,0.4); padding: 10px 18px; border-radius: 8px; }
    .pills { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 12px; max-width: 420px; }
    .pill { border: 2px solid; border-radius: 10px; padding: 7px 14px; }
    .pill-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .pill-value { font-size: 17px; font-weight: 600; margin-top: 1px; }
    .qr-slot { text-align: center; }
    .qr-img { width: 130px; height: 130px; background: #fff; padding: 8px; border-radius: 8px; }
    .qr-caption { font-size: 15px; color: rgba(255,255,255,0.85); margin-top: 6px; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  ${hostImg ? `<div class="hero-photo"></div><div class="scrim"></div>` : ""}
  ${s.logo_placement === "photo-corner" && logo ? `<div class="photo-corner-logo">${logo}</div>` : ""}
  <div class="content">
    ${
      !logoInFooter && s.logo_placement !== "photo-corner" && logo
        ? `<div class="top-bar${s.logo_placement === "top-center" ? " top-bar-center" : ""}">${logo}</div>`
        : ""
    }
    ${kicker ? `<div class="kicker">${kicker}</div>` : ""}
    <div class="title">${title}</div>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
    ${tagPills}
    ${showDescription ? `<div class="desc">${description}</div>` : ""}
    ${highlightBlock}
    ${
      host
        ? `<div class="who">${renderRibbon(host.title ? "FEATURED SPEAKER" : "HOST", gold, primary)}<div class="who-name">${escapeHtml(host.name || "")}</div>${host.title ? `<div class="who-title">${escapeHtml(host.title)}</div>` : ""}</div>`
        : ""
    }
    <div class="footer">
      <div class="footer-left">
        ${logoInFooter && logo ? `<div class="footer-logo">${logo}</div>` : ""}
        ${cta ? `<div class="cta">${cta}</div>` : ""}
        <div class="pills">${pills}</div>
      </div>
      ${qrDataUrl ? `<div class="qr-slot"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div></div>` : ""}
    </div>
  </div>
</body></html>`;
};

module.exports = { meta, render };
