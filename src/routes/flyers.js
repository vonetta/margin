const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Flyer = require("../models/Flyer");
const Person = require("../models/Person");
const Ministry = require("../models/Ministry");
const AiProfile = require("../models/AiProfile");
const { requireRole } = require("../middleware/auth");
const { generateFlyer } = require("../services/flyerService");
const { uploadFile, safeDeleteFile } = require("../services/storageService");
const { listLayouts, suggestLayout } = require("../services/layouts");
const { validateStyle } = require("../services/layouts/styleSchema");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/flyers/layouts — the gallery of available layouts + metadata
router.get("/layouts", (req, res) => {
  res.json(listLayouts());
});

// GET /api/flyers — flyer history for the ministry
router.get("/", async (req, res) => {
  try {
    const flyers = await Flyer.find({ ministry_id: req.ministryId }).sort({
      created_at: -1,
    });
    res.json(flyers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flyers" });
  }
});

// POST /api/flyers/generate — the main event
router.post(
  "/generate",
  requireRole("admin", "leader"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("layout").optional().trim(),
    body("host_id").optional().trim(),
    body("speaker_ids")
      .optional()
      .isArray()
      .withMessage("speaker_ids must be an array"),
    body("qr_url").optional().trim(),
    body("theme_tags")
      .optional()
      .isArray()
      .withMessage("theme_tags must be an array"),
  ],
  validate,
  async (req, res) => {
    try {
      const {
        title,
        subtitle,
        description,
        theme_tags,
        audience,
        date,
        location,
        cost,
        cta,
        qr_url,
        host_id,
        speaker_ids = [],
        layout,
      } = req.body;

      // Always clamped to safe ranges regardless of where it came from —
      // an AI-proposed value from the chat, a manual override from the
      // customization wizard, or a raw API call.
      const style = validateStyle(req.body.style);

      // Resolve ministry branding + type system
      const ministry = await Ministry.findOne({ ministry_id: req.ministryId });
      const aiProfile = await AiProfile.findOne({
        ministry_id: req.ministryId,
      });
      const typeSystem = aiProfile?.type_system || null;

      // Resolve people from the roster
      let host = null;
      if (host_id) {
        host = await Person.findOne({
          _id: host_id,
          ministry_id: req.ministryId,
        });
      }
      let speakers = [];
      if (speaker_ids.length) {
        speakers = await Person.find({
          _id: { $in: speaker_ids },
          ministry_id: req.ministryId,
        });
      }

      const content = {
        title,
        subtitle,
        description,
        theme_tags,
        audience,
        date,
        location,
        cost,
        cta,
        qr_caption: req.body.qr_caption,
      };

      const baseArgs = {
        content,
        branding: ministry?.branding || {},
        typeSystem,
        qrUrl: qr_url || null,
        host,
        speakers,
        layout: layout || null,
        style,
        ministryId: req.ministryId,
      };

      // Generate both sizes
      const social = await generateFlyer({ ...baseArgs, size: "social" });
      const print = await generateFlyer({
        ...baseArgs,
        size: "print",
        backgroundUrl: null,
      });

      // Save both to R2
      const socialUp = await uploadFile({
        ministryId: req.ministryId,
        category: "flyers",
        buffer: social.png,
        contentType: "image/png",
        originalName: `${title}-social`,
      });
      const printUp = await uploadFile({
        ministryId: req.ministryId,
        category: "flyers",
        buffer: print.png,
        contentType: "image/png",
        originalName: `${title}-print`,
      });

      // Store the record
      const flyer = await Flyer.create({
        ministry_id: req.ministryId,
        title,
        layout: social.meta.layout,
        tone: social.meta.tone,
        social_url: socialUp.url,
        social_key: socialUp.key,
        print_url: printUp.url,
        print_key: printUp.key,
        content,
        host_id: host_id || null,
        speaker_ids,
        background_id: social.meta.background_id || null,
        qr_url: qr_url || null,
        created_by: req.userId,
      });

      res.status(201).json(flyer);
    } catch (error) {
      console.error("Flyer generation error:", error);
      res.status(500).json({ error: "Failed to generate flyer" });
    }
  },
);

// DELETE /api/flyers/:id
router.delete("/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const flyer = await Flyer.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!flyer) return res.status(404).json({ error: "Flyer not found" });

    for (const key of [flyer.social_key, flyer.print_key]) {
      if (key) await safeDeleteFile(key);
    }
    await Flyer.deleteOne({ _id: flyer._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete flyer" });
  }
});

module.exports = router;
