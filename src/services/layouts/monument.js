const {
  escapeHtml,
  hexToRgba,
  DIMENSIONS,
  resolveColors,
  resolveFonts,
  brandGradient,
  renderRibbon,
  renderLogo,
  abstractLinesOverlay,
  deriveColorVariants,
} = require("./shared");
const { validateStyle } = require("./styleSchema");

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
  const resolvedColors = resolveColors(branding);
  const { bg, text } = resolvedColors;
  const resolvedFonts = resolveFonts(typography);

  const title = escapeHtml(content.title || "");
  const subtitle = escapeHtml(content.subtitle || "");
  const description = escapeHtml(content.description || "");
  const themeTags = Array.isArray(content.theme_tags) ? content.theme_tags : [];
  const highlights = Array.isArray(content.highlights) ? content.highlights : [];
  const audience = escapeHtml(content.audience || "");
  const dateLine = escapeHtml(content.date || "");
  const location = escapeHtml(content.location || "");
  const cost = escapeHtml(content.cost || "");
  const cta = escapeHtml(content.cta || "");
  const qrCaption = escapeHtml(content.qr_caption || "Scan to register");

  const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : "";

  const hostImg = host && (host.cutout_url || host.headshot_url);
  const hasSpeakers = speakers.length > 0;
  const speakerCount = speakers.length;
  // Auto-scale by count first, then let an explicit AI/wizard override win —
  // composing the two means "no opinion" (most common case) still gets the
  // sensible per-count default instead of one fixed size for every count.
  const autoSpeakerSize =
    speakerCount <= 2 ? 200 : speakerCount === 3 ? 170 : 150;
  const s = validateStyle({
    speaker_photo_size: autoSpeakerSize,
    ...(style || {}),
  });
  const speakerSize = s.speaker_photo_size;

  // Every variant is mathematically derived from the ministry's own brand
  // colors (see deriveColorVariants) — picking "warm" or "cool" can't drift
  // off-brand, it just shifts emphasis within the same palette.
  const variants = deriveColorVariants(resolvedColors);
  const { primary, accent, gold } = variants[s.color_variant] || variants.brand;

  // The wizard only ever sends one of the ministry's own curated
  // type_system fonts, so an override here is still "on brand" — just a
  // different pairing from the same curated set, not an arbitrary font.
  const display = s.display_font || resolvedFonts.display;
  const body = s.body_font || resolvedFonts.body;
  const accentFont = s.accent_font || resolvedFonts.accent;

  const logo = renderLogo(branding.logo_url, s.logo_size);
  const logoInContent =
    logo && s.logo_placement !== "footer"
      ? `<div class="top-bar${s.logo_placement === "top-center" ? " top-bar-center" : ""}">${logo}</div>`
      : "";
  const logoInFooter =
    logo && s.logo_placement === "footer"
      ? `<div class="footer-logo">${logo}</div>`
      : "";

  // The background (photo or brand gradient) spans the FULL top-zone
  // canvas rather than being confined to a narrow side panel — a hard
  // color-block split reads as two separate boxes glued together once the
  // panel is anything less than ~50% of the page. A light scrim fades in
  // from the left so the title/text stay legible without needing a solid
  // opaque block; the background still shows faintly through it and is
  // fully visible on the right where the host photo sits. A loose abstract
  // line texture sits over the gradient fallback so it doesn't read as a
  // flat, empty color when there's no real photo to fill the space.
  const photoZoneBg = backgroundUrl
    ? `background-image: linear-gradient(${hexToRgba(primary, 0.3)}, ${hexToRgba(primary, 0.5)}), url('${backgroundUrl}'); background-size: cover; background-position: center;`
    : `background-image: ${abstractLinesOverlay("#ffffff", 0.16)}, ${brandGradient({ primary, accent, gold }, 165)}; background-size: cover, cover;`;

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

  const tagPills =
    themeTags.length && s.tags_visible
      ? `<div class="tag-row">${themeTags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

  const showDescription = description && s.description_visible;

  const highlightBlock = highlights.length
    ? `<div class="highlights">${highlights
        .map(
          (h) =>
            `<div class="highlight-item"><span class="highlight-mark">✓</span>${escapeHtml(h)}</div>`,
        )
        .join("")}</div>`
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
    .top-zone { position: relative; overflow: hidden; ${hasSpeakers ? "flex: 0 0 auto; min-height: 520px;" : "flex: 1; min-height: 0;"} ${photoZoneBg} }
    .text-scrim { position: absolute; top: 0; left: 0; bottom: 0; width: 58%; background: linear-gradient(90deg, ${bg} 0%, ${bg} 42%, ${hexToRgba(bg, 0)} 100%); z-index: 1; }
    .photo-zone { position: absolute; top: 0; right: 0; bottom: 0; width: 40%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; z-index: 2; }
    .host-circle-wrap { position: relative; display: inline-block; }
    .host-circle-wrap .ribbon { position: absolute; top: -6px; right: -16px; }
    .host-circle { width: ${s.host_photo_size}px; height: ${s.host_photo_size}px; border-radius: 50%; border: 6px solid #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.35); background-size: cover; background-position: center top; background-color: ${hexToRgba("#ffffff", 0.15)}; display: flex; align-items: center; justify-content: center; font-size: ${Math.round(s.host_photo_size * 0.31)}px; color: #fff; font-family: '${display}', serif; }
    .content { position: relative; z-index: 2; padding: 48px 48px 36px; width: 50%; }
    .top-bar { margin-bottom: 26px; }
    .top-bar-center { text-align: center; }
    .title { font-family: '${display}', serif; font-weight: 800; font-size: ${s.title_size}px; line-height: 1.0; color: ${primary}; text-transform: uppercase; }
    .subtitle-script { font-family: '${accentFont}', cursive; font-size: ${s.subtitle_size}px; color: ${accent}; line-height: 1; margin-top: 8px; }
    .desc { font-size: ${s.description_size}px; line-height: 1.5; color: ${hexToRgba(text, 0.85)}; font-style: italic; margin-top: 16px; max-width: 380px; }
    .tag-row { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; }
    .tag-pill { display: inline-block; padding: 7px 18px; border-radius: 20px; border: 1.5px solid ${hexToRgba(primary, 0.5)}; color: ${primary}; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
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
    .highlights { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
    .highlight-item { display: flex; align-items: flex-start; gap: 8px; font-size: 16px; color: ${primary}; font-weight: 500; line-height: 1.3; }
    .highlight-mark { color: ${gold}; font-weight: 700; flex-shrink: 0; }
    .meta-row { display: flex; align-items: center; justify-content: center; gap: 22px; padding: 18px 0; border-top: 1px solid ${hexToRgba(primary, 0.18)}; border-bottom: 1px solid ${hexToRgba(primary, 0.18)}; }
    .meta-item { display: flex; align-items: center; gap: 10px; }
    .meta-icon { width: 36px; height: 36px; border-radius: 50%; background: ${primary}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
    .meta-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${accent}; }
    .meta-value { font-size: 18px; font-weight: 700; color: ${primary}; }
    .meta-divider { width: 1px; height: 30px; background: ${hexToRgba(primary, 0.2)}; }
    .footer { flex: 0 0 auto; background: ${primary}; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 36px 56px; border-top: 4px solid ${gold}; }
    .footer-left { display: flex; flex-direction: column; gap: 14px; }
    .footer-logo .logo { filter: brightness(0) invert(1); }
    .cta { font-family: '${display}', serif; font-size: ${Math.round(s.cta_size * 0.82)}px; font-weight: 800; color: ${gold}; text-transform: uppercase; line-height: 1.3; max-width: 70%; }
    .qr-slot { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
    .qr-img { width: 148px; height: 148px; background: #fff; padding: 9px; border-radius: 8px; }
    .qr-caption { font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500; }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${fontLink}<style>${styles}</style></head>
<body>
  <div class="top-zone">
    <div class="text-scrim"></div>
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
      ${logoInContent}
      <div class="title">${title}</div>
      ${subtitle ? `<div class="subtitle-script">${subtitle}</div>` : ""}
      ${tagPills}
      ${showDescription ? `<div class="desc">${description}</div>` : ""}
      ${highlightBlock}
    </div>
  </div>
  <div class="mid-zone">
    ${speakerBlock}
    ${metaRow}
  </div>
  <div class="footer">
    <div class="footer-left">
      ${logoInFooter}
      ${cta ? `<div class="cta">${cta}</div>` : ""}
    </div>
    ${qrBlock}
  </div>
</body></html>`;
};

module.exports = { meta, render };
