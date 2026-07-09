const sharp = require("sharp");
const { generateFullFlyer } = require("./imageService");
const { generateQRBuffer } = require("./qrService");
const { selectTypography, inferTone } = require("./typographyService");

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
// prompt can tell the model exactly what each attached image IS. The logo
// is deliberately NOT gathered here — earlier versions sent it as a
// "reproduce this exactly" reference, but the model doesn't literally
// copy reference pixels, it re-draws its own interpretation, and re-drawn
// small text (a multi-word wordmark) is exactly where these models
// introduce typos ("GLOBAL MINISTTIES"). The real logo file is composited
// on afterward instead — see overlayLogo, same principle already applied
// to the QR code below (never trust the model to draw something that has
// to be pixel-accurate to work).
const gatherReferenceImages = async ({ host, speakers }) => {
  const candidates = [
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
      const roleLabel = ref.role === "host" ? "the host" : "a speaker";
      return `Attached image ${n} is a real photo of ${ref.name || roleLabel} (${roleLabel}) — incorporate their actual likeness naturally into the design (a portrait cutout, a circular frame, or similar), don't replace them with a generic stand-in.`;
    })
    .join("\n");

// The image model has no equivalent of the template engine's per-tone font
// library — it just needs a few words of art direction. A ministry can
// name its own tone categories anything (formal/warm/energetic/classic
// here, "solemn"/"jubilant" elsewhere), so this matches on what the name
// itself suggests rather than a fixed lookup table, and falls back to
// today's existing gala/elegant direction whenever nothing matches —
// preserving current behavior for every formal event instead of guessing.
const ENERGETIC_TONE_HINTS = ["energetic", "casual", "playful", "fun", "youth", "upbeat", "festive", "party"];
const WARM_TONE_HINTS = ["warm", "relational", "cozy", "fellowship", "community", "family"];

const designLanguageForTone = (tone) => {
  const t = (tone || "").toLowerCase();
  if (ENERGETIC_TONE_HINTS.some((hint) => t.includes(hint))) {
    return {
      direction:
        "bold, energetic, modern event-flyer design — think a fun community gathering, not a gala. Vibrant color-blocking or dynamic shapes from the brand palette, punchy contemporary display typography (no ornate serif, no gold-foil elegance, no formal invitation styling), playful decorative touches (bold shapes, confetti-like accents, or bright texture) rather than fine linework or refined gold dividers.",
      typography: "bold, friendly, contemporary sans-serif display type — nothing that reads formal or ornate",
    };
  }
  if (WARM_TONE_HINTS.some((hint) => t.includes(hint))) {
    return {
      direction:
        "warm, inviting, relational event-flyer design — soft gradients or organic textures from the brand palette, approachable typography, a welcoming rather than corporate or overly formal feel.",
      typography: "warm, approachable display type — a friendly serif or rounded sans, not stiff or corporate",
    };
  }
  return null;
};

const DEFAULT_DESIGN_DIRECTION =
  "sophisticated, editorial event-flyer design — think a well-designed gala or church-event invitation, not a generic template. Use tasteful typography hierarchy and a refined color-blocked or gradient background using the brand palette.";

// A top-center band directly behind the model's own headline went through
// several rounds of ratio-tuning and never fully stopped colliding with
// the title — a centered logo and a centered headline are structurally
// fighting for the exact same real estate, and the model's placement
// varies enough per-generation that no fixed ratio reliably wins. The QR
// code, by contrast, has never once collided with anything across any of
// these generations — because it lives in a corner, which is never where
// a centered headline goes. The logo now follows that same proven
// pattern: a small corner badge instead of a full-width hero band.
// Shared with overlayLogo below so the space the prompt asks the model to
// leave blank is the same space the real logo actually gets pasted into.
const LOGO_AREA = {
  widthRatio: 0.16, // similar proportion to the QR code's own corner badge
  margin: 0.05, // distance from the canvas edge, as a fraction of width
};

const buildFullFlyerPrompt = ({ branding = {}, content = {}, referenceImages = [], typeSystem = null, tone = null }) => {
  const colors = branding.colors || {};
  const palette = [
    colors.primary && `deep primary ${colors.primary}`,
    colors.accent && `accent ${colors.accent}`,
    colors.gold && `gold/foil accent ${colors.gold}`,
    colors.background && `light background option ${colors.background}`,
  ]
    .filter(Boolean)
    .join(", ");

  const toneDesign = designLanguageForTone(tone);

  // Prefer the ministry's own tone-tagged font library (the same one the
  // template engine picks from) over the single static branding.fonts
  // default, so an energetic event actually gets described with a
  // fitting typeface instead of always naming the ministry's one formal
  // display font.
  const typography = typeSystem ? selectTypography(typeSystem, "", tone) : null;
  const headingFont = typography?.display?.name || branding.fonts?.heading;
  const bodyFontName = typography?.body?.name || branding.fonts?.body;
  const fontLine = toneDesign
    ? `Typography feel: ${toneDesign.typography}.`
    : headingFont || bodyFontName
      ? `Typography feel: ${headingFont || "an elegant serif"} headlines, clean ${bodyFontName || "modern"} body text.`
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

  const hasLogo = !!branding.logo_url;
  // Never asks the model to letter the organization's name anywhere when
  // a real logo exists — that's exactly how a re-drawn wordmark ends up
  // misspelled. The actual logo file gets composited into this reserved
  // corner afterward (see overlayLogo), guaranteeing it's pixel-accurate.
  // A small top-left corner badge, not a full-width band — the event
  // title is centered and reliably large, so a corner is structurally
  // never where it lands (the QR code, which already lives in a corner,
  // has never once collided with anything across any generation).
  const logoLine = hasLogo
    ? `Leave a small square area completely blank in the TOP-LEFT CORNER of the canvas, about ${Math.round(LOGO_AREA.widthRatio * 100)}% of the image width and starting right at the edge with a small margin — no text, no icons, no shapes there. The organization's real full-color logo will be composited into that corner afterward, so it also MUST have a light, neutral backdrop directly behind it (near-white, cream, or a soft light tint of the palette) even if the rest of the design uses darker tones — the same treatment already used for the QR-code corner. Never letter the organization's own name/initials as separate text anywhere in the design (e.g. do not write out "${branding.name || "the organization's name"}") — the logo already carries that. This does NOT apply to the event's own title, which is different content and must still be a large, prominent headline as usual.`
    : "";

  return `Design a polished, professional event flyer image for a church/ministry organization${branding.name && !hasLogo ? ` called ${branding.name}` : ""}, portrait orientation.

Brand colors: ${palette || "a tasteful, cohesive palette"}. ${fontLine}

Event details — render this text EXACTLY as written, spelled correctly, no typos, no garbled or illegible letters, no invented details beyond what's listed. Use proper title case or sentence case for the title and headlines — never render headline text in all-lowercase. Do not add any other text anywhere in the design beyond what's listed here plus the organization's name — no invented promo codes, taglines, hashtags, extra labels, or filler numbers/strings of any kind:
${textLines}

${referenceLine}

${logoLine}

Design direction: ${toneDesign?.direction || DEFAULT_DESIGN_DIRECTION} Fill the FULL canvas with intentional design from top to bottom — no large empty single-color areas or dead space; balance content, texture, or decorative elements across the entire composition, in keeping with the direction above. No stock-photo clutter, no placeholder people beyond the reference photos provided. Leave one small, clearly-bounded uncluttered area (roughly bottom-right, about 15% of the image width) completely free of text or design elements — a QR code will be composited there afterward. This should look like it was made by a professional graphic designer for a real organization, not generic AI art.`;
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

// Composites the ministry's REAL logo file onto the generated flyer, in
// the top-left corner — never the model's own re-drawn interpretation of
// it (see LOGO_AREA above for why a corner, not a top-center band). Same
// structure as overlayQr just above: the logo sits on its own opaque
// backing square, so coverage is guaranteed by the compositing itself
// regardless of whether the model actually left that corner blank —
// exactly the QR code's proven, collision-free pattern. Best-effort: a
// failed logo fetch just skips the overlay rather than failing the whole
// flyer, matching fetchImageReference's posture elsewhere in this file.
const overlayLogo = async (pngBuffer, logoUrl, { backingColor } = {}) => {
  const logo = await fetchImageReference(logoUrl);
  if (!logo) return pngBuffer;

  const { width: canvasWidth } = await sharp(pngBuffer).metadata();
  const logoSize = Math.round(canvasWidth * LOGO_AREA.widthRatio);
  const pad = Math.round(logoSize * 0.12);
  const margin = Math.round(canvasWidth * LOGO_AREA.margin);

  const resizedLogo = await sharp(logo.buffer)
    .resize({ width: logoSize })
    .png()
    .toBuffer();
  const { height: resizedHeight } = await sharp(resizedLogo).metadata();

  const backing = await sharp({
    create: {
      width: logoSize + pad * 2,
      height: resizedHeight + pad * 2,
      channels: 4,
      background: backingColor || { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resizedLogo, top: pad, left: pad }])
    .png()
    .toBuffer();

  return sharp(pngBuffer)
    .composite([{ input: backing, top: margin, left: margin }])
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
  typeSystem = null,
  // Same contract as flyerService.generateFlyer's resolvedTone: an
  // AI-proposed tone already clamped to one of this ministry's own
  // categories (chat-drafted path), undefined to run keyword inference
  // against the event text (manual-entry path), or explicitly null for
  // "no tone preference."
  resolvedTone,
}) => {
  const referenceImages = await gatherReferenceImages({ host, speakers });
  const toneSource = [content.title, content.subtitle, content.description].filter(Boolean).join(" ");
  const tone =
    resolvedTone !== undefined ? resolvedTone : inferTone(toneSource, typeSystem?.tone_keywords);
  const prompt = buildFullFlyerPrompt({ branding, content, referenceImages, typeSystem, tone });
  const aspectRatio = ASPECT_RATIO_BY_SIZE[size] || ASPECT_RATIO_BY_SIZE.social;

  let png = await generateFullFlyer(prompt, referenceImages, { aspectRatio });

  if (branding.logo_url) {
    png = await overlayLogo(png, branding.logo_url);
  }
  if (qrUrl) {
    png = await overlayQr(png, qrUrl, { darkColor: branding.colors?.primary });
  }

  return {
    png,
    meta: {
      engine: "ai",
      size,
      tone,
      has_logo: !!branding.logo_url,
      has_qr: !!qrUrl,
      reference_image_count: referenceImages.length,
      host: host?.name || null,
      speaker_count: speakers.length,
    },
  };
};

module.exports = { generateAiFlyer, buildFullFlyerPrompt };
