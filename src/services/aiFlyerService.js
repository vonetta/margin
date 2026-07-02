const sharp = require("sharp");
const { generateFullFlyer } = require("./imageService");
const { generateQRBuffer } = require("./qrService");

const ASPECT_RATIO_BY_SIZE = {
  social: "4:5",
  print: "3:4",
};

// Matches the pixel dimensions the rest of the app assumes for each size,
// so the QR overlay is positioned/sized consistently regardless of engine.
const DIMENSIONS_BY_SIZE = {
  social: { width: 1080, height: 1350 },
  print: { width: 1275, height: 1650 },
};

// Download a remote image (a person's headshot, a ministry logo) into a
// buffer the model can take as a grounding reference. Best-effort — a
// failed fetch just means that one reference is skipped, not that the
// whole flyer generation fails.
const fetchImageReference = async (url) => {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return { buffer: Buffer.from(arrayBuffer), mimeType: contentType };
  } catch (err) {
    return null;
  }
};

// Cap reference images — more than a handful adds cost/latency without
// meaningfully improving grounding, and risks the model spending its
// attention imitating photos instead of designing the flyer.
const MAX_REFERENCE_IMAGES = 4;

const gatherReferenceImages = async ({ branding, host, speakers }) => {
  const candidates = [
    branding?.logo_url,
    host?.cutout_url || host?.headshot_url,
    ...speakers.map((s) => s.cutout_url || s.headshot_url),
  ].filter(Boolean);

  const results = await Promise.all(
    candidates.slice(0, MAX_REFERENCE_IMAGES).map(fetchImageReference),
  );
  return results.filter(Boolean);
};

const buildFullFlyerPrompt = ({ branding = {}, content = {}, host, speakers = [] }) => {
  const colors = branding.colors || {};
  const palette = [
    colors.primary && `deep primary ${colors.primary}`,
    colors.accent && `accent ${colors.accent}`,
    colors.gold && `gold/foil accent ${colors.gold}`,
    colors.background && `light background option ${colors.background}`,
  ]
    .filter(Boolean)
    .join(", ");

  const fontLine = branding.fonts
    ? `Typography feel: ${branding.fonts.heading || "an elegant serif"} headlines, clean ${branding.fonts.body || "modern"} body text.`
    : "Typography feel: elegant serif headlines, clean modern body text.";

  const textLines = [
    content.title && `Title: "${content.title}"`,
    content.subtitle && `Subtitle: "${content.subtitle}"`,
    content.date && `Date: "${content.date}"`,
    content.location && `Location: "${content.location}"`,
    content.cost && `Cost: "${content.cost}"`,
    content.audience && `Audience: "${content.audience}"`,
    content.cta && `Call to action: "${content.cta}"`,
  ]
    .filter(Boolean)
    .join("\n");

  const peopleLine =
    host || speakers.length
      ? `A reference photo is attached for ${[host?.name, ...speakers.map((s) => s.name)].filter(Boolean).join(" and ")} — incorporate ${host ? "them" : "these speakers"} naturally into the design (a portrait cutout, a circular frame, or similar), keeping their likeness recognizable rather than replacing them with a generic stand-in.`
      : "";

  return `Design a polished, professional event flyer image for a church/ministry organization${branding.name ? ` called ${branding.name}` : ""}, portrait orientation.

Brand colors: ${palette || "a tasteful, cohesive palette"}. ${fontLine}

Event details — render this text EXACTLY as written, spelled correctly, no typos, no invented details beyond what's listed:
${textLines}

${peopleLine}

Design direction: sophisticated, editorial event-flyer design — think a well-designed gala or church-event invitation, not a generic template. Use tasteful typography hierarchy, generous negative space, a refined color-blocked or gradient background using the brand palette, and a subtle decorative element (fine linework, a gold accent divider, or a soft abstract texture). No stock-photo clutter, no placeholder people beyond the reference photos provided. Leave a clear, uncluttered area in the bottom third free of text or important detail — a QR code will be added there afterward. This should look like it was made by a professional graphic designer for a real organization, not generic AI art.`;
};

// Composites a real, guaranteed-scannable QR code onto the generated image
// — the model is never trusted to draw a working QR code itself, since
// there's no way to verify a model-drawn one actually scans.
const overlayQr = async (pngBuffer, qrUrl, { size, darkColor } = {}) => {
  const dims = DIMENSIONS_BY_SIZE[size] || DIMENSIONS_BY_SIZE.social;
  const qrSize = Math.round(dims.width * 0.14);
  const pad = Math.round(qrSize * 0.12);
  const boxSize = qrSize + pad * 2;

  const qrPng = await generateQRBuffer(qrUrl, {
    width: qrSize,
    darkColor: darkColor || "#000000",
  });

  const backing = await sharp({
    create: {
      width: boxSize,
      height: boxSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: qrPng, top: pad, left: pad }])
    .png()
    .toBuffer();

  const margin = Math.round(dims.width * 0.05);
  return sharp(pngBuffer)
    .composite([
      {
        input: backing,
        top: dims.height - boxSize - margin,
        left: dims.width - boxSize - margin,
      },
    ])
    .png()
    .toBuffer();
};

// Generate a full designer-style flyer directly via image generation,
// instead of the deterministic HTML/CSS template pipeline in
// flyerService.js. A real QR code is always composited on afterward, never
// left to the model to draw, since it has to actually scan.
const generateAiFlyer = async ({
  branding = {},
  content = {},
  host = null,
  speakers = [],
  qrUrl = null,
  size = "social",
}) => {
  const referenceImages = await gatherReferenceImages({ branding, host, speakers });
  const prompt = buildFullFlyerPrompt({ branding, content, host, speakers });
  const aspectRatio = ASPECT_RATIO_BY_SIZE[size] || ASPECT_RATIO_BY_SIZE.social;

  let png = await generateFullFlyer(prompt, referenceImages, { aspectRatio });

  if (qrUrl) {
    png = await overlayQr(png, qrUrl, { size, darkColor: branding.colors?.primary });
  }

  return {
    png,
    meta: {
      engine: "ai",
      size,
      has_qr: !!qrUrl,
      reference_image_count: referenceImages.length,
      host: host?.name || null,
      speaker_count: speakers.length,
    },
  };
};

module.exports = { generateAiFlyer, buildFullFlyerPrompt };
