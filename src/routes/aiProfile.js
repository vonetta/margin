const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const AiProfile = require("../models/AiProfile");
const SopDraft = require("../models/SopDraft");
const { requireRole } = require("../middleware/auth");
const { aiLimiter } = require("../middleware/rateLimiters");
const { uploadFile, safeDeleteFile } = require("../services/storageService");
const { draftSopFromImages } = require("../services/imageService");
const { exportSopAsPdf } = require("../services/sopExportService");
const { buildProfileFromWebsite } = require("../services/onboardingScraperService");
const { UrlSafetyError } = require("../services/urlSafetyService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 }, // 5MB per image, 8 images per batch
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  },
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// POST /api/profile/onboarding/prefill — the AI-prefill step of onboarding.
// Fetches the ministry's own website (SSRF-guarded) and drafts a brand-voice
// profile from it via Gemini. Returns a DRAFT only — nothing is written
// here; the onboarding wizard pre-fills its editable fields from this and
// the admin saves through the normal /voice, /hashtags, /ministry endpoints.
// A UrlSafetyError (bad/blocked URL, non-HTML page) is a 400 the user can
// act on, distinct from a 500 model/parse failure.
router.post(
  "/onboarding/prefill",
  requireRole("admin", "leader"),
  aiLimiter,
  [
    body("website_url").trim().notEmpty().withMessage("A website URL is required"),
    body("past_posts").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const draft = await buildProfileFromWebsite({
        websiteUrl: req.body.website_url,
        pastPosts: req.body.past_posts || "",
      });
      res.json(draft);
    } catch (error) {
      if (error instanceof UrlSafetyError) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Onboarding prefill error:", error);
      res.status(500).json({ error: "Couldn't build a profile from that website" });
    }
  },
);

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
// Add an SOP you already wrote (not AI-drafted) — still lands as
// pending_review, same as an AI-drafted one, so every SOP passes through
// the same one-click review gate before it can affect content generation,
// regardless of how it got in.
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
      const sopDraft = await SopDraft.create({
        ministry_id: req.ministryId,
        title: req.body.title,
        content: req.body.content,
        tags: req.body.tags || [],
        status: "pending_review",
        created_by: req.userId,
      });

      res.status(201).json(sopDraft);
    } catch (error) {
      res.status(500).json({ error: "Failed to add SOP" });
    }
  },
);

// POST /api/profile/sops/draft — draft an SOP from a batch of images + a
// shared notes field via Gemini vision. Saved as pending_review — it does
// NOT touch AiProfile.sops, so it can't influence content generation until
// an admin/leader approves it below.
router.post(
  "/sops/draft",
  requireRole("admin", "leader"),
  aiLimiter,
  upload.array("images", 8),
  [body("notes").optional().trim()],
  validate,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "At least one image is required" });
      }

      const draft = await draftSopFromImages(
        req.files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype })),
        req.body.notes || "",
      );

      const uploads = await Promise.all(
        req.files.map((f, i) =>
          uploadFile({
            ministryId: req.ministryId,
            category: "sop-sources",
            buffer: f.buffer,
            contentType: f.mimetype,
            originalName: `sop-source-${i}`,
          }),
        ),
      );

      const sopDraft = await SopDraft.create({
        ministry_id: req.ministryId,
        notes: req.body.notes || "",
        image_urls: uploads.map((u) => u.url),
        image_keys: uploads.map((u) => u.key),
        title: draft.title,
        content: draft.content,
        status: "pending_review",
        created_by: req.userId,
      });

      res.status(201).json(sopDraft);
    } catch (error) {
      console.error("SOP draft generation error:", error);
      res.status(500).json({ error: "Failed to draft an SOP from these images" });
    }
  },
);

// GET /api/profile/sops/drafts — list, optionally filtered by status.
// SOPs can carry payment/vendor detail, so this needs the same admin/leader
// bar as every other SOP route rather than being readable by any
// authenticated ministry member.
router.get("/sops/drafts", requireRole("admin", "leader"), async (req, res) => {
  try {
    const filter = { ministry_id: req.ministryId };
    if (req.query.status) filter.status = req.query.status;
    const drafts = await SopDraft.find(filter).sort({ created_at: -1 });
    res.json(drafts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch SOP drafts" });
  }
});

// PUT /api/profile/sops/drafts/:id — edit title/content (the "tweak" step)
router.put(
  "/sops/drafts/:id",
  requireRole("admin", "leader"),
  [
    body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
    body("content").optional().trim().notEmpty().withMessage("Content cannot be empty"),
  ],
  validate,
  async (req, res) => {
    try {
      const updates = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.content !== undefined) updates.content = req.body.content;

      const draft = await SopDraft.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );

      if (!draft) return res.status(404).json({ error: "SOP draft not found" });
      res.json(draft);
    } catch (error) {
      res.status(500).json({ error: "Failed to update SOP draft" });
    }
  },
);

// PUT /api/profile/sops/drafts/:id/approve
router.put(
  "/sops/drafts/:id/approve",
  requireRole("admin", "leader"),
  async (req, res) => {
    try {
      const draft = await SopDraft.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        { $set: { status: "approved", approved_by: req.userId, approved_at: new Date() } },
        { returnDocument: "after" },
      );

      if (!draft) return res.status(404).json({ error: "SOP draft not found" });
      res.json(draft);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve SOP draft" });
    }
  },
);

// PUT /api/profile/sops/drafts/:id/reject
router.put(
  "/sops/drafts/:id/reject",
  requireRole("admin", "leader"),
  async (req, res) => {
    try {
      const draft = await SopDraft.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        { $set: { status: "rejected" } },
        { returnDocument: "after" },
      );

      if (!draft) return res.status(404).json({ error: "SOP draft not found" });
      res.json(draft);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject SOP draft" });
    }
  },
);

// GET /api/profile/sops/drafts/:id/export — a downloadable PDF, streamed
// directly through this authenticated route rather than stored on R2.
// R2 URLs in this app are unsigned and permanently public with only 32 bits
// of random-suffix entropy on the key — fine for a public flyer image, not
// appropriate for a document that can carry payment methods and vendor
// relationships.
router.get(
  "/sops/drafts/:id/export",
  requireRole("admin", "leader"),
  async (req, res) => {
    try {
      const mode = req.query.mode === "clean" ? "clean" : "internal";
      const draft = await SopDraft.findOne({
        _id: req.params.id,
        ministry_id: req.ministryId,
      });
      if (!draft) return res.status(404).json({ error: "SOP draft not found" });

      const pdf = await exportSopAsPdf({ draft, ministry: req.ministry, mode });

      draft.exports.push({ by: req.userId, mode, at: new Date() });
      await draft.save();

      const filename = `${draft.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdf);
    } catch (error) {
      console.error("SOP export error:", error);
      res.status(500).json({ error: "Failed to export this SOP" });
    }
  },
);

// DELETE /api/profile/sops/drafts/:id
router.delete("/sops/drafts/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const draft = await SopDraft.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!draft) return res.status(404).json({ error: "SOP draft not found" });

    for (const key of draft.image_keys) {
      await safeDeleteFile(key);
    }
    await SopDraft.deleteOne({ _id: draft._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete SOP draft" });
  }
});

module.exports = router;
