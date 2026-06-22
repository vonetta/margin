const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { generateContent } = require("../services/generationService");
const AiProfile = require("../models/AiProfile");
const ContentDraft = require("../models/ContentDraft");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const VALID_PLATFORMS = ["Instagram", "Facebook", "Email", "Quote card"];

// POST /api/content/generate
router.post(
  "/generate",
  [
    body("prompt").trim().notEmpty().withMessage("Prompt is required"),
    body("platform")
      .trim()
      .notEmpty()
      .withMessage("Platform is required")
      .isIn(VALID_PLATFORMS)
      .withMessage(`Platform must be one of: ${VALID_PLATFORMS.join(", ")}`),
  ],
  validate,
  async (req, res) => {
    try {
      const profile = await AiProfile.findOne({ ministry_id: req.ministryId });

      if (!profile) {
        return res
          .status(404)
          .json({ error: "AI profile not found for this ministry" });
      }

      const { prompt, platform } = req.body;

      const generatedCaption = await generateContent(
        prompt,
        profile,
        req.ministry,
        platform,
      );

      const draft = await ContentDraft.create({
        ministry_id: req.ministryId,
        prompt,
        platform,
        caption: generatedCaption,
        generated_by: req.headers["x-user-id"] || "team",
        status: "pending",
      });

      res.status(201).json({
        draft_id: draft._id,
        platform: draft.platform,
        caption: draft.caption,
        status: draft.status,
        created_at: draft.created_at,
      });
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({
        error: "Content generation failed",
      });
    }
  },
);

// GET /api/content/drafts
router.get("/drafts", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { ministry_id: req.ministryId };
    if (status) filter.status = status;

    const drafts = await ContentDraft.find(filter)
      .sort({ created_at: -1 })
      .limit(50);

    res.json(drafts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch drafts" });
  }
});

// GET /api/content/drafts/:id
router.get("/drafts/:id", async (req, res) => {
  try {
    const draft = await ContentDraft.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });

    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch draft" });
  }
});

// PUT /api/content/drafts/:id/approve
router.put("/drafts/:id/approve", async (req, res) => {
  try {
    const draft = await ContentDraft.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId },
      {
        status: "approved",
        approved_at: new Date(),
        approved_by: req.headers["x-user-id"] || "ap-khy",
      },
      { returnDocument: "after" },
    );

    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: "Failed to approve draft" });
  }
});

// PUT /api/content/drafts/:id/reject
router.put("/drafts/:id/reject", async (req, res) => {
  try {
    const draft = await ContentDraft.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId },
      { status: "rejected" },
      { returnDocument: "after" },
    );

    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: "Failed to reject draft" });
  }
});

// PUT /api/content/drafts/:id/feedback
router.put(
  "/drafts/:id/feedback",
  [body("feedback").trim().notEmpty().withMessage("Feedback is required")],
  validate,
  async (req, res) => {
    try {
      const draft = await ContentDraft.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        {
          feedback: req.body.feedback,
          status: "rejected",
        },
        { returnDocument: "after" },
      );

      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      res.json(draft);
    } catch (error) {
      res.status(500).json({ error: "Failed to save feedback" });
    }
  },
);

module.exports = router;
