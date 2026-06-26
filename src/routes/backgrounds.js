const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Background = require("../models/Background");
const { requireRole } = require("../middleware/auth");
const { generateBackground } = require("../services/imageService");
const { uploadFile, safeDeleteFile } = require("../services/storageService");
const Ministry = require("../models/Ministry");

// Compose a brand-aware prompt: user describes mood, ministry palette steers color.
const buildBrandPrompt = (userPrompt, ministry) => {
  const colors = ministry?.branding?.colors || {};
  const palette = [
    colors.primary,
    colors.accent,
    colors.gold,
    colors.background,
  ].filter(Boolean);

  const paletteText = palette.length
    ? ` Use a cohesive color palette drawn from and harmonious with these brand colors: ${palette.join(", ")}. The colors may be blended, gradated, or used as complementary tones, but the overall feeling must coordinate with this palette.`
    : "";

  return `${userPrompt.trim()}.${paletteText} This is a background for an event flyer: leave generous, uncluttered negative space for text and photos to be placed on top. No text, no words, no logos, no people.`;
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/backgrounds — the reusable library for this ministry
router.get("/", async (req, res) => {
  try {
    const { tone } = req.query;
    const filter = { ministry_id: req.ministryId };
    if (tone) filter.tone = tone;

    const backgrounds = await Background.find(filter).sort({ created_at: -1 });
    res.json(backgrounds);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch backgrounds" });
  }
});

// POST /api/backgrounds/generate — make a new one, store it, add to library
router.post(
  "/generate",
  requireRole("admin", "leader"),
  [
    body("prompt").trim().notEmpty().withMessage("Prompt is required"),
    body("tone").optional().trim(),
    body("aspect_ratio")
      .optional()
      .isIn(["4:5", "1:1", "16:9", "9:16"])
      .withMessage("Invalid aspect ratio"),
  ],
  validate,
  async (req, res) => {
    try {
      const ministry = await Ministry.findOne({ ministry_id: req.ministryId });
      const fullPrompt = buildBrandPrompt(req.body.prompt, ministry);

      const png = await generateBackground(fullPrompt, {
        aspectRatio: req.body.aspect_ratio || "4:5",
      });

      const { key, url } = await uploadFile({
        ministryId: req.ministryId,
        category: "backgrounds",
        buffer: png,
        contentType: "image/png",
        originalName: "background",
      });

      const background = await Background.create({
        ministry_id: req.ministryId,
        prompt: req.body.prompt, // store the user's original prompt, not the expanded one
        url,
        key,
        tone: req.body.tone,
        created_by: req.userId,
      });

      res.status(201).json(background);
    } catch (error) {
      console.error("Background generation error:", error);
      res.status(500).json({ error: "Failed to generate background" });
    }
  },
);

// DELETE /api/backgrounds/:id — remove from library and storage
router.delete("/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const background = await Background.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });

    if (!background) {
      return res.status(404).json({ error: "Background not found" });
    }

    await safeDeleteFile(background.key);

    await Background.deleteOne({ _id: background._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete background" });
  }
});

module.exports = router;
