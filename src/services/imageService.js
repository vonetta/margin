const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;
const getClient = () => {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

const MODEL_ID = "gemini-2.5-flash-image";
const VISION_TEXT_MODEL_ID = "gemini-2.5-flash";

// Generate a flyer background from a text prompt.
// Returns a PNG buffer.
const generateBackground = async (prompt, { aspectRatio = "4:5" } = {}) => {
  if (!prompt || !prompt.trim()) {
    throw new Error("A prompt is required to generate a background");
  }

  const model = getClient().getGenerativeModel({ model: MODEL_ID });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt.trim() }] }],
    generationConfig: {
      responseModalities: ["Image"],
      imageConfig: { aspectRatio },
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData);

  if (!imagePart) {
    throw new Error("No image returned from Gemini");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
};

// Remove the background from a headshot, returning a clean cut-out.
// Takes an input image buffer + mime type, returns a PNG buffer.
const removeBackground = async (imageBuffer, mimeType = "image/jpeg") => {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error("An image buffer is required");
  }

  const model = getClient().getGenerativeModel({ model: MODEL_ID });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Remove the background completely and replace it with a solid, pure, flat white background (#FFFFFF). Keep only the person, fully intact and unaltered, including fine hair detail. Do not leave any furniture, props, or objects that are not part of the person. The background must be perfectly uniform pure white.",
          },

          { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["Image"],
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData);

  if (!imagePart) {
    throw new Error("No image returned from Gemini");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
};

// Generate a full, designer-style flyer image with text baked in directly
// by the model, optionally grounded with reference photos (host/speaker
// headshots, logo) so it can incorporate real people/marks instead of
// inventing generic ones. Returns a PNG buffer.
const generateFullFlyer = async (
  prompt,
  referenceImages = [],
  { aspectRatio = "4:5" } = {},
) => {
  if (!prompt || !prompt.trim()) {
    throw new Error("A prompt is required to generate a flyer");
  }

  const model = getClient().getGenerativeModel({ model: MODEL_ID });

  const imageParts = referenceImages
    .filter((img) => img && img.buffer)
    .map((img) => ({
      inlineData: {
        mimeType: img.mimeType || "image/jpeg",
        data: img.buffer.toString("base64"),
      },
    }));

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt.trim() }, ...imageParts],
      },
    ],
    generationConfig: {
      responseModalities: ["Image"],
      imageConfig: { aspectRatio },
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData);

  if (!imagePart) {
    throw new Error("No image returned from Gemini");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
};

// Read an already-made flyer image and extract its event details as JSON,
// so a caption can be written without asking the user to retype facts
// that are already on the flyer.
const extractFlyerDetails = async (imageBuffer, mimeType = "image/jpeg") => {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error("An image buffer is required");
  }

  const model = getClient().getGenerativeModel({ model: VISION_TEXT_MODEL_ID });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Read this event flyer image and extract its details. Respond with raw JSON only, no markdown fences, no commentary, using exactly this shape — use null for anything not visible on the flyer:
{"title": string|null, "subtitle": string|null, "date": string|null, "location": string|null, "cost": string|null, "cta": string|null, "registration_url": string|null, "other_details": string|null}
"other_details" should capture anything else relevant (host, speakers, theme, series) that doesn't fit the other fields.`,
          },
          { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
        ],
      },
    ],
  });

  const textPart = result.response.candidates?.[0]?.content?.parts?.find(
    (p) => p.text,
  );
  if (!textPart) {
    throw new Error("No text returned from Gemini");
  }

  const cleaned = textPart.text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Could not parse flyer details from the model's response");
  }
};

// Draft a Standard Operating Procedure from a batch of reference images
// (screenshots, photos of a whiteboard/process, etc.) plus free-text notes
// — Claude has no vision access in this codebase, so anything that has to
// actually SEE an image goes through Gemini, same as flyer-detail
// extraction and headshot cutouts above.
const draftSopFromImages = async (images, notes = "") => {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("At least one image is required to draft an SOP");
  }

  const model = getClient().getGenerativeModel({ model: VISION_TEXT_MODEL_ID });

  const imageParts = images.map((img) => ({
    inlineData: { mimeType: img.mimeType || "image/jpeg", data: img.buffer.toString("base64") },
  }));

  const promptText = `You are drafting a Standard Operating Procedure (SOP) document for a ministry/organization, based on the attached reference images (screenshots, photos of a process, whiteboard notes, etc.)${notes ? " and the notes below" : ""}.

${notes ? `Notes from the person requesting this SOP:\n${notes}\n` : ""}
Write a clear, complete SOP: a short descriptive title, then step-by-step instructions covering what's shown/described. Be concrete and actionable — this will be reviewed and edited by a human before use, so it's fine to note where something in the images is ambiguous, but don't invent specifics (names, tools, numbers) that aren't actually shown or stated.

Respond with raw JSON only, no markdown fences, no commentary, using exactly this shape:
{"title": string, "content": string}
"content" should be the full SOP body as plain text, using numbered steps and short paragraphs/line breaks as needed for readability.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: promptText }, ...imageParts] }],
  });

  const textPart = result.response.candidates?.[0]?.content?.parts?.find((p) => p.text);
  if (!textPart) {
    throw new Error("No text returned from Gemini");
  }

  const cleaned = textPart.text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.title || !parsed.content) {
      throw new Error("Missing title or content");
    }
    return parsed;
  } catch (e) {
    throw new Error("Could not parse an SOP from the model's response");
  }
};

module.exports = {
  generateBackground,
  removeBackground,
  extractFlyerDetails,
  generateFullFlyer,
  draftSopFromImages,
  MODEL_ID,
};
