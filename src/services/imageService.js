const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;
const getClient = () => {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

const MODEL_ID = "gemini-2.5-flash-image";

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

module.exports = { generateBackground, removeBackground, MODEL_ID };
