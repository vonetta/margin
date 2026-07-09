const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  brandGradient,
  resolveStyledTheme,
  resolveLogo,
} = require("./shared");

const meta = {
  name: "Canvas",
  description:
    "Full-bleed venue photo with a translucent info panel. Save-the-dates and location-driven events.",
  suits_tones: ["warm", "classic"],
  needs_host: false,
  ideal_speakers: "0",
};

const render = ({
  size = "social",
  dims: providedDims = null,
  typography,
  branding = {},
  content = {},
  qrDataUrl = null,
  backgroundUrl = null,
  fontsUrl = null,
  style = null,
}) => {
  const dims = providedDims || DIMENSIONS[size] || DIMENSIONS.social;
  const { s, primary, accent, gold, display, body, accentFont } =
    resolveStyledTheme(branding, typography, style);

  const kicker = escapeHtml(content.kicker || "");
  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const description = escapeHtml(content.description || "");
  const themeTags = Array.isArray(content.theme_tags) ? content.theme_tags : [];
  const highlights = Array.isArray(content.highlights) ? content.highlights : [];
  const audience = escapeHtml(content.audience || "");
  const panelLead = escapeHtml(content.panel_lead || "Save the Date");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const cta = escapeHtml(content.cta || "");
  const rsvpBy = escapeHtml(content.rsvp_by || "");
  const contact = escapeHtml(content.contact || "");
  const footerNote = escapeHtml(content.footer_note || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");
  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  // canvas only has two real slots for a logo — riding along the top bar
  // (over the photo) or down with the CTA — so footer-* placements move it
  // to the bottom bar, everything else keeps it up top.
  const logoInFooter = s.logo_placement === "footer-left" || s.logo_placement === "footer-right";
  const { logo, footerLogoNeedsInvert } = resolveLogo(branding, s, {
    safePlacements: logoInFooter ? [] : ["top-left", "top-center"],
  });

  const overlayAlpha = s.gradient_overlay_opacity / 100;
  const bgStyle = backgroundUrl
    ? `background-image: ${overlayAlpha > 0 ? `${brandGradient({ primary, accent, gold }, s.gradient_angle, overlayAlpha)}, ` : ""}url('${backgroundUrl}'); background-size: cover; background-position: center;`
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
    body { font-family: '${body}', sans-serif; overflow: hidden; position: relative; ${bgStyle} }
    .logo-backing { display: inline-flex; align-items: center; justify-content: center; }
    .logo-backing-circle { background: #fff; border-radius: 50%; padding: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .logo-backing-pill { background: #fff; border-radius: 999px; padding: 8px 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .topbar { position: absolute; top: 0; left: 0; right: 0; padding: 48px 64px; z-index: 3; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .topbar-text { flex: 1; }
    .kicker { font-size: 15px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${gold}; text-shadow: 0 2px 10px rgba(0,0,0,0.6); margin-bottom: 6px; }
    .title { font-family: '${display}', serif; font-weight: 700; font-size: ${s.title_size}px; color: #fff; text-shadow: 0 3px 20px rgba(0,0,0,0.6); line-height: 1.02; }
    .subtitle { font-family: '${accentFont}', cursive; font-size: ${s.subtitle_size}px; color: ${gold}; text-shadow: 0 2px 12px rgba(0,0,0,0.6); margin-top: 4px; }
    .tag-row { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px; }
    .tag-pill { display: inline-block; padding: 6px 16px; border-radius: 20px; border: 1.5px solid rgba(255,255,255,0.6); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; text-shadow: 0 1px 6px rgba(0,0,0,0.5); }
    .desc { font-size: ${s.description_size}px; line-height: 1.5; color: rgba(255,255,255,0.92); font-style: italic; margin-top: 14px; max-width: 420px; text-shadow: 0 2px 12px rgba(0,0,0,0.5); }
    .panel { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 580px; background: ${hexToRgba(primary, 0.88)}; border: 2px solid ${gold}; padding: 54px 50px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); z-index: 4; }
    .panel-lead { font-family: '${accentFont}', cursive; font-size: 66px; color: ${gold}; line-height: 0.9; }
    .panel-date { font-size: 38px; font-weight: 700; color: #fff; margin-top: 20px; }
    .panel-loc { font-size: 27px; color: rgba(255,255,255,0.92); margin-top: 12px; line-height: 1.4; }
    .panel-meta { display: flex; justify-content: center; gap: 28px; margin-top: 18px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-label { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${gold}; }
    .meta-value { font-size: 22px; font-weight: 600; color: #fff; margin-top: 2px; }
    .qr-img { width: 150px; height: 150px; background: #fff; padding: 9px; border-radius: 10px; margin: 26px auto 0; }
    .qr-caption { font-size: 17px; color: ${gold}; margin-top: 10px; }
    .botbar { position: absolute; bottom: 0; left: 0; right: 0; background: ${primary}; border-top: 4px solid ${gold}; padding: 30px 64px; z-index: 3; display: flex; align-items: center; justify-content: center; gap: 20px; }
    ${footerLogoNeedsInvert ? ".botbar .logo { filter: brightness(0) invert(1); }" : ""}
    .botbar-note { font-family: '${display}', serif; font-size: ${Math.round(s.cta_size * 0.85)}px; font-weight: 700; color: ${gold}; text-transform: uppercase; text-align: center; }
    .botbar-contact { font-size: 13px; color: rgba(255,255,255,0.75); text-align: center; margin-top: 4px; }
    .highlights { position: absolute; bottom: 110px; left: 0; right: 0; display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; padding: 0 64px; z-index: 3; }
    .highlight-item { display: flex; align-items: center; gap: 6px; font-size: 16px; color: #fff; font-weight: 600; text-shadow: 0 2px 10px rgba(0,0,0,0.6); }
    .highlight-mark { color: ${gold}; font-weight: 700; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="topbar">
    <div class="topbar-text">
      ${kicker ? `<div class="kicker">${kicker}</div>` : ""}
      <div class="title">${title}</div>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
      ${tagPills}
      ${showDescription ? `<div class="desc">${description}</div>` : ""}
    </div>
    ${!logoInFooter && logo ? logo : ""}
  </div>
  <div class="panel">
    <div class="panel-lead">${panelLead}</div>
    ${dateLine ? `<div class="panel-date">${dateLine}</div>` : ""}
    ${location ? `<div class="panel-loc">${location}</div>` : ""}
    ${
      cost || audience || rsvpBy
        ? `<div class="panel-meta">${cost ? `<div class="meta-item"><div class="meta-label">Cost</div><div class="meta-value">${cost}</div></div>` : ""}${audience ? `<div class="meta-item"><div class="meta-label">For</div><div class="meta-value">${audience}</div></div>` : ""}${rsvpBy ? `<div class="meta-item"><div class="meta-label">RSVP By</div><div class="meta-value">${rsvpBy}</div></div>` : ""}</div>`
        : ""
    }
    ${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">${qrCaption}</div>` : ""}
  </div>
  ${highlightBlock}
  ${
    footerNote || cta || logoInFooter || contact
      ? `<div class="botbar">${logoInFooter && logo ? logo : ""}<div><div class="botbar-note">${footerNote || cta}</div>${contact ? `<div class="botbar-contact">${contact}</div>` : ""}</div></div>`
      : ""
  }
</body></html>`;
};

module.exports = { meta, render };
