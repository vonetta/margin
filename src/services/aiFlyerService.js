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

// A dominant hero-sized portrait makes sense for a formal teaching/
// preaching event where the host IS the draw — it reads as mismatched
// on a casual, kid-oriented, or community event where the host is just
// running things, not the headline attraction. This mirrors the same
// ENERGETIC_TONE_HINTS check used for the overall design direction, so
// the two stay consistent instead of the design going casual while the
// portrait still gets gala-scale treatment.
const describeReferenceImages = (referenceImages, tone = null) => {
  const t = (tone || "").toLowerCase();
  const isCasual = ENERGETIC_TONE_HINTS.some((hint) => t.includes(hint));
  const sizingNote = isCasual
    ? "keep it modest and proportionate — a small supporting photo (e.g. a corner circle or badge), not a large dominant hero portrait, since this is a casual/community event where the host is running things, not the headline attraction"
    : "a portrait cutout, a circular frame, or similar, sized as a genuine focal point";
  return referenceImages
    .map((ref, i) => {
      const n = i + 1;
      const roleLabel = ref.role === "host" ? "the host" : "a speaker";
      return `Attached image ${n} is a real photo of ${ref.name || roleLabel} (${roleLabel}) — incorporate their actual likeness naturally into the design (${sizingNote}), don't replace them with a generic stand-in.`;
    })
    .join("\n");
};

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

const buildFullFlyerPrompt = ({ branding = {}, content = {}, referenceImages = [], typeSystem = null, tone = null, qrUrl = null }) => {
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
    content.kicker && `Eyebrow/series line (small text above the title): "${content.kicker}"`,
    content.title && `Title: "${content.title}"`,
    content.subtitle && `Subtitle: "${content.subtitle}"`,
    content.date && `Date: "${content.date}" — this must render in full, every character, with clear margin from the canvas edge; shrink the text or wrap it onto two lines rather than letting any part of it run off the edge or get cut short. Pay special attention to any trailing zero in a time (e.g. the "30" in "5:30") — these are real digits, not padding, and must never be dropped or shortened (never render "5:30" as "5:3").`,
    content.location && `Location: "${content.location}" — this must render in full, every character, never truncated or cut short partway through. If it sits inside or alongside a decorative shape (a ribbon, banner, badge, or similar), that shape must be drawn large enough to fully contain the complete text — never let the shape's own edge or a neighboring badge (like a cost circle) squeeze, crowd, or cut the address off early. If it doesn't comfortably fit on one line, wrap it onto a second line inside the same shape rather than shortening it.`,
    content.cost && `Cost: "${content.cost}"`,
    content.audience && `Audience: "${content.audience}"`,
    content.rsvp_by && `RSVP by: "${content.rsvp_by}" (render as its own small distinct line, not merged into the CTA)`,
    content.cta && `Call to action: "${content.cta}"`,
    content.contact && `Contact (small print in the footer area, on the OPPOSITE side of the canvas from the QR-code corner, never underneath or crowding it): "${content.contact}" — this must render in full, every character, on a single line with clear margin from the canvas edge; shrink the text size if needed rather than letting any part of it run off the edge or get cut short. If this includes a phone number, every digit matters and must be reproduced exactly — dropping or altering even one digit (e.g. rendering "211-232-4356" as "211-232-456") makes the number wrong and unreachable. It's fine (not "inventing" content) to prefix it with a short generic label like "Contact:" if that reads better, but never add any actual new information beyond what's given here.`,
  ]
    .filter(Boolean)
    .join("\n");

  const referenceLine = describeReferenceImages(referenceImages, tone);

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

Event details — render this text EXACTLY as written, character for character, including every digit (e.g. a time like "5:00" must never be shortened to "5:0", an address must never be abbreviated or cut short) — spelled correctly, no typos, no garbled or illegible letters, no invented details beyond what's listed. Use proper title case or sentence case for the title and headlines — never render headline text in all-lowercase. Do not add any other text anywhere in the design beyond what's listed here plus the organization's name — no invented promo codes, taglines, hashtags, extra labels, or filler numbers/strings of any kind:
${textLines}

${referenceLine}

${logoLine}

Composition safety margins — every one of these is a hard requirement: keep ALL text fully inside the canvas with a comfortable margin from every edge — never let a word or line get cropped, cut off, or run off the side, top, or bottom of the image. Every text element needs its own clear empty space around it with no overlap — the title must not overlap or run into the reserved logo corner${qrUrl ? ", the eyebrow/kicker line above the title must sit with visible breathing room above the title (never overlapping or touching it), and small print like the contact line must not overlap the QR-code corner" : ", and the eyebrow/kicker line above the title must sit with visible breathing room above the title (never overlapping or touching it)"}. If a line of text is long, wrap it onto multiple lines or reduce its size rather than letting it collide with anything else or run off the canvas. This also applies to decorative elements: a circle, badge, shape, or icon (e.g. a decorative cost badge) must never sit on top of or overlap any text — every decorative element and every text element each get their own clear space, with no piece of text ever partially hidden behind anything else.

Legibility is a hard requirement, not a style choice: every single text element must have strong, clearly readable contrast against whatever is directly behind it — never a color close in tone to its background (e.g. light pink text on a cream/light-pink background, or pale gold on white). If a text element sits on a busy, textured, or similar-toned area, give it a solid or semi-opaque backing panel, a strong outline, or a drop shadow so it stays legible — don't just change its color and hope. Also: never render any text, number, or line twice, faded, doubled, or as a ghosted duplicate anywhere in the design — each piece of text appears exactly once, fully opaque.

${qrUrl ? "Never draw anything that resembles a QR code, barcode, or scannable-looking grid/dot pattern anywhere in the design, including inside decorative elements — a real QR code is composited into the reserved bottom-right corner afterward, and the model attempting to draw its own (even as a texture or pattern) reads as a broken second code once the real one is placed on top." : "This flyer has no QR code — never draw one, and never leave a blank reserved square/box anywhere in the design (e.g. in a corner) as if space were being held for one. Fill the entire canvas with real design content; an empty box reads as a mistake, not a design choice."}

Design direction: ${toneDesign?.direction || DEFAULT_DESIGN_DIRECTION} Fill the FULL canvas with intentional design from top to bottom — no large empty single-color areas or dead space; balance content, texture, or decorative elements across the entire composition, in keeping with the direction above. No stock-photo clutter, no placeholder people beyond the reference photos provided.${qrUrl ? " Leave one small, clearly-bounded uncluttered area (roughly bottom-right, about 15% of the image width) completely free of text or design elements — a QR code will be composited there afterward." : ""} This should look like it was made by a professional graphic designer for a real organization, not generic AI art.`;
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
  const prompt = buildFullFlyerPrompt({ branding, content, referenceImages, typeSystem, tone, qrUrl });
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
