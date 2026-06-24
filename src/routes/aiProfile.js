const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const AiProfile = require("../models/AiProfile");
const { requireRole } = require("../middleware/auth");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/profile
// Get full AI profile for current ministry
router.get("/", async (req, res) => {
  try {
    const profile = await AiProfile.findOne({ ministry_id: req.ministryId });
    if (!profile) {
      return res.status(404).json({ error: "AI profile not found" });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch AI profile" });
  }
});

// PUT /api/profile/voice
// Update voice profile fields
router.put(
  "/voice",
  requireRole("admin", "leader"),
  [
    body("persona_name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Persona name cannot be empty"),
    body("sign_off")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Sign off cannot be empty"),
    body("tone_pillars")
      .optional()
      .isArray()
      .withMessage("Tone pillars must be an array"),
    body("tone_pillars.*")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Tone pillar cannot be empty"),
    body("avoid").optional().isArray().withMessage("Avoid must be an array"),
    body("avoid.*")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Avoid item cannot be empty"),
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = [
        "persona_name",
        "sign_off",
        "tone_pillars",
        "avoid",
        "registers",
      ];
      const updates = Object.keys(req.body)
        .filter((key) => allowed.includes(key))
        .reduce((obj, key) => {
          obj[`voice_profile.${key}`] = req.body[key];
          return obj;
        }, {});

      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.json(profile.voice_profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to update voice profile" });
    }
  },
);

// PUT /api/profile/hashtags
router.put(
  "/hashtags",
  requireRole("admin", "leader"),
  [
    body("brand").optional().isArray().withMessage("Brand must be an array"),
    body("brand.*").optional().trim().notEmpty(),
    body("content")
      .optional()
      .isArray()
      .withMessage("Content must be an array"),
    body("content.*").optional().trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = ["brand", "content"];
      const updates = Object.keys(req.body)
        .filter((key) => allowed.includes(key))
        .reduce((obj, key) => {
          obj[`hashtags.${key}`] = req.body[key];
          return obj;
        }, {});

      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.json(profile.hashtags);
    } catch (error) {
      res.status(500).json({ error: "Failed to update hashtags" });
    }
  },
);

// PUT /api/profile/ctas
// Body: { ctas: { key: value, ... } } — replaces the whole CTA map
router.put(
  "/ctas",
  requireRole("admin", "leader"),
  [body("ctas").isObject().withMessage("ctas must be an object")],
  validate,
  async (req, res) => {
    try {
      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $set: { ctas: req.body.ctas } },
        { returnDocument: "after", runValidators: true },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.json(profile.ctas);
    } catch (error) {
      res.status(500).json({ error: "Failed to update CTAs" });
    }
  },
);

// POST /api/profile/phrases
// Add a sample phrase
router.post(
  "/phrases",
  requireRole("admin", "leader"),
  [body("phrase").trim().notEmpty().withMessage("Phrase is required")],
  validate,
  async (req, res) => {
    try {
      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $addToSet: { "voice_profile.sample_phrases": req.body.phrase } },
        { returnDocument: "after" },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.json(profile.voice_profile.sample_phrases);
    } catch (error) {
      res.status(500).json({ error: "Failed to add phrase" });
    }
  },
);

// DELETE /api/profile/phrases
// Remove a sample phrase
router.delete(
  "/phrases",
  requireRole("admin", "leader"),
  [body("phrase").trim().notEmpty().withMessage("Phrase is required")],
  validate,
  async (req, res) => {
    try {
      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $pull: { "voice_profile.sample_phrases": req.body.phrase } },
        { returnDocument: "after" },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.json(profile.voice_profile.sample_phrases);
    } catch (error) {
      res.status(500).json({ error: "Failed to remove phrase" });
    }
  },
);

// POST /api/profile/feedback
// Log feedback from Ap Khy's review — this is the profile tweak loop
router.post(
  "/feedback",
  requireRole("admin", "leader"),
  [
    body("feedback").trim().notEmpty().withMessage("Feedback is required"),
    body("draft_title").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const feedbackEntry = {
        title: `Feedback note`,
        content: req.body.feedback,
        tags: ["feedback", "voice-correction"],
        updated_at: new Date(),
      };

      if (req.body.draft_title) {
        feedbackEntry.title = `Feedback on: ${req.body.draft_title}`;
        feedbackEntry.tags.push(
          req.body.draft_title.toLowerCase().replace(/\s+/g, "-"),
        );
      }

      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $push: { sops: feedbackEntry } },
        { returnDocument: "after" },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.status(201).json({
        message: "Feedback logged to profile",
        entry: feedbackEntry,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to log feedback" });
    }
  },
);

// POST /api/profile/sops
// Add a new SOP chunk
router.post(
  "/sops",
  requireRole("admin", "leader"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("content").trim().notEmpty().withMessage("Content is required"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
  ],
  validate,
  async (req, res) => {
    try {
      const sop = {
        title: req.body.title,
        content: req.body.content,
        tags: req.body.tags || [],
        updated_at: new Date(),
      };

      const profile = await AiProfile.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $push: { sops: sop } },
        { returnDocument: "after" },
      );

      if (!profile) {
        return res.status(404).json({ error: "AI profile not found" });
      }

      res.status(201).json(sop);
    } catch (error) {
      res.status(500).json({ error: "Failed to add SOP" });
    }
  },
);

module.exports = router;
