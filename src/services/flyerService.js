const { selectTypography } = require("./typographyService");
const { buildGoogleFontsUrl } = require("./fontLoader");
const { generateQRCode } = require("./qrService");
const { buildFlyerHtml, DIMENSIONS } = require("./flyerTemplate");
const { renderHtmlToPng } = require("./flyerRenderer");

const generateFlyer = async ({
  size = "social",
  content = {},
  branding = {},
  typeSystem = null,
  qrUrl = null,
}) => {
  const toneSource = [content.title, content.subtitle, content.event_type]
    .filter(Boolean)
    .join(" ");

  const typography = selectTypography(typeSystem, toneSource);

  const fontsUrl =
    typeSystem && typeSystem.fonts
      ? buildGoogleFontsUrl(typeSystem.fonts)
      : null;

  let qrDataUrl = null;
  if (qrUrl) {
    qrDataUrl = await generateQRCode(qrUrl, {
      darkColor: branding.colors?.primary || "#000000",
    });
  }

  const html = buildFlyerHtml({
    size,
    typography,
    branding,
    content,
    qrDataUrl,
    fontsUrl,
  });

  const dims = DIMENSIONS[size] || DIMENSIONS.social;
  const png = await renderHtmlToPng(html, dims.width, dims.height);

  return {
    png,
    meta: {
      size,
      dimensions: dims,
      tone: typography.tone,
      fonts_used: typography.fonts_used,
      has_qr: !!qrDataUrl,
    },
  };
};

module.exports = { generateFlyer };
