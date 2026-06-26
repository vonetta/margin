const { selectTypography } = require("./typographyService");
const { buildGoogleFontsUrl } = require("./fontLoader");
const { generateQRCode } = require("./qrService");
const { renderLayout, suggestLayout } = require("./layouts");
const { resolveDimensions } = require("./layouts/shared");
const { renderHtmlToPng } = require("./flyerRenderer");
const { selectBackground } = require("./backgroundSelector");

const generateFlyer = async ({
  size = "social",
  platform = null, // selects "social" dimensions per-platform (Instagram/Facebook/etc.)
  layout = null,
  content = {},
  branding = {},
  typeSystem = null,
  qrUrl = null,
  host = null,
  speakers = [],
  backgroundUrl = null,
  venueImage = null,
  ministryId = null, // needed for auto background selection
  autoBackground = true, // off for tests / when caller supplies a bg
  style = null,
}) => {
  const tone = content.event_type || content.title || "";
  const chosenLayout =
    layout || suggestLayout({ host, speakers, venueImage, tone });

  const toneSource = [content.title, content.subtitle, content.event_type]
    .filter(Boolean)
    .join(" ");
  const typography = selectTypography(typeSystem, toneSource);
  const fontsUrl = typeSystem?.fonts
    ? buildGoogleFontsUrl(typeSystem.fonts)
    : null;

  // Auto-select a background if none was provided
  let bgUrl = backgroundUrl || venueImage;
  let bgMeta = null;
  if (!bgUrl && autoBackground && ministryId) {
    const topicHint = [content.title, ...(content.theme_tags || [])]
      .filter(Boolean)
      .join(", ");
    const selected = await selectBackground({
      ministryId,
      layout: chosenLayout,
      tone: typography.tone,
      topicHint,
    });
    bgUrl = selected.url;
    bgMeta = {
      background_id: selected.id,
      background_generated: selected.generated,
    };
  }

  let qrDataUrl = null;
  if (qrUrl) {
    qrDataUrl = await generateQRCode(qrUrl, {
      darkColor: branding.colors?.primary || "#000000",
    });
  }

  // Resolved once and passed straight through, so the HTML template's own
  // layout math and the screenshot viewport always agree on the exact same
  // pixel dimensions — computing it twice from `size` independently risked
  // them drifting apart whenever a platform's dimensions differ from the
  // generic "social" default.
  const dims = resolveDimensions(size, platform);

  const html = renderLayout(chosenLayout, {
    size,
    dims,
    typography,
    branding,
    content,
    host,
    speakers,
    qrDataUrl,
    backgroundUrl: bgUrl,
    fontsUrl,
    style,
  });

  const png = await renderHtmlToPng(html, dims.width, dims.height);

  return {
    png,
    meta: {
      layout: chosenLayout,
      size,
      dimensions: dims,
      tone: typography.tone,
      fonts_used: typography.fonts_used,
      has_qr: !!qrDataUrl,
      has_background: !!bgUrl,
      host: host?.name || null,
      speaker_count: speakers.length,
      ...bgMeta,
    },
  };
};

module.exports = { generateFlyer };
