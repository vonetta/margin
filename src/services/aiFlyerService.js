const sharp = require("sharp");
const { generateFullFlyer } = require("./imageService");
const { generateQRBuffer } = require("./qrService");

const ASPECT_RATIO_BY_SIZE = {
  social: "4:5",
  print: "3:4",
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

// Each reference keeps a role/name label alongside its image data, so the
// prompt can tell the model exactly what each attached image IS (e.g. "the
// second image is your official logo, reproduce it exactly") instead of
// leaving it to guess — which is how a generic invented logo/cross icon
// replaces the ministry's actual mark.
const gatherReferenceImages = async ({ branding, host, speakers }) => {
  const candidates = [
    branding?.logo_url && { role: "logo", name: null, url: branding.logo_url },
    host && (host.cutout_url || host.headshot_url)
      ? { role: "host", name: host.name, url: host.cutout_url || host.headshot_url }
      : null,
    ...speakers
      .filter((s) => s.cutout_url || s.headshot_url)
      .map((s) => ({ role: "speaker", name: s.name, url: s.cutout_url || s.headshot_url })),
  ].filter(Boolean);

  const fetched = await Promise.all(
    candidates.slice(0, MAX_REFERENCE_IMAGES).map(async (c) => {
      const img = await fetchImageReference(c.url);
      return img ? { ...c, ...img } : null;
    }),
  );
  return fetched.filter(Boolean);
};

const describeReferenceImages = (referenceImages) =>
  referenceImages
    .map((ref, i) => {
      const n = i + 1;
      if (ref.role === "logo") {
        return `Attached image ${n} is the organization's OFFICIAL LOGO — reproduce it exactly as given (same mark, same colors), do not redesign, restyle, or invent a substitute logo.`;
      }
      const roleLabel = ref.role === "host" ? "the host" : "a speaker";
      return `Attached image ${n} is a real photo of ${ref.name || roleLabel} (${roleLabel}) — incorporate their actual likeness naturally into the design (a portrait cutout, a circular frame, or similar), don't replace them with a generic stand-in.`;
    })
    .join("\n");

const buildFullFlyerPrompt = ({ branding = {}, content = {}, referenceImages = [] }) => {
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

  const referenceLine = describeReferenceImages(referenceImages);

  return `Design a polished, professional event flyer image for a church/ministry organization${branding.name ? ` called ${branding.name}` : ""}, portrait orientation.

Brand colors: ${palette || "a tasteful, cohesive palette"}. ${fontLine}

Event details — render this text EXACTLY as written, spelled correctly, no typos, no garbled or illegible letters, no invented details beyond what's listed. Use proper title case or sentence case for the title and headlines — never render headline text in all-lowercase:
${textLines}

${referenceLine}

Design direction: sophisticated, editorial event-flyer design — think a well-designed gala or church-event invitation, not a generic template. Use tasteful typography hierarchy and a refined color-blocked or gradient background using the brand palette. Fill the FULL canvas with intentional design from top to bottom — no large empty single-color areas or dead space; balance content, texture, or decorative elements (fine linework, a gold accent divider, a soft abstract pattern) across the entire composition. No stock-photo clutter, no placeholder people beyond the reference photos provided. Leave one small, clearly-bounded uncluttered area (roughly bottom-right, about 15% of the image width) completely free of text or design elements — a QR code will be composited there afterward. This should look like it was made by a professional graphic designer for a real organization, not generic AI art.`;
};

// Composites a real, guaranteed-scannable QR code onto the generated image
// — the model is never trusted to draw a working QR code itself, since
// there's no way to verify a model-drawn one actually scans.
//
// The image model doesn't reliably return the exact pixel size implied by
// the requested aspect ratio (asking for "4:5" has come back as 896x1152,
// not the assumed 1080x1350) — positioning the QR against an assumed
// canvas size pushed it partly off the actual image. Always read the real
// dimensions off the generated buffer instead of assuming one.
const overlayQr = async (pngBuffer, qrUrl, { darkColor } = {}) => {
  const { width, height } = await sharp(pngBuffer).metadata();
  const qrSize = Math.round(width * 0.14);
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

  const margin = Math.round(width * 0.05);
  return sharp(pngBuffer)
    .composite([
      {
        input: backing,
        top: Math.max(0, height - boxSize - margin),
        left: Math.max(0, width - boxSize - margin),
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
  const prompt = buildFullFlyerPrompt({ branding, content, referenceImages });
  const aspectRatio = ASPECT_RATIO_BY_SIZE[size] || ASPECT_RATIO_BY_SIZE.social;

  let png = await generateFullFlyer(prompt, referenceImages, { aspectRatio });

  if (qrUrl) {
    png = await overlayQr(png, qrUrl, { darkColor: branding.colors?.primary });
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
