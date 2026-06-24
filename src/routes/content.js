const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { generateContent, chatTurn } = require("../services/generationService");
const AiProfile = require("../models/AiProfile");
const ContentDraft = require("../models/ContentDraft");
const { requireRole } = require("../middleware/auth");

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
        generated_by: req.userId,
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

// POST /api/content/chat — one turn of a back-and-forth content conversation.
// The model either asks a clarifying question (done: false) or finalizes
// the content via a tool call (done: true). The client owns the message
// history and resends it in full each turn — no server-side session state.
router.post(
  "/chat",
  [
    body("platform")
      .trim()
      .notEmpty()
      .withMessage("Platform is required")
      .isIn(VALID_PLATFORMS)
      .withMessage(`Platform must be one of: ${VALID_PLATFORMS.join(", ")}`),
    body("messages")
      .isArray({ min: 1 })
      .withMessage("messages must be a non-empty array"),
    body("messages.*.role").isIn(["user", "assistant"]),
    body("messages.*.content").trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const { platform, messages } = req.body;

      if (messages[messages.length - 1].role !== "user") {
        return res
          .status(400)
          .json({ error: "The last message must be from the user" });
      }

      const profile = await AiProfile.findOne({ ministry_id: req.ministryId });
      if (!profile) {
        return res
          .status(404)
          .json({ error: "AI profile not found for this ministry" });
      }

      const result = await chatTurn({
        profile,
        ministry: req.ministry,
        platform,
        messages,
      });

      const replyContent = result.done ? result.caption : result.message;

      res.json({
        done: result.done,
        caption: result.done ? result.caption : undefined,
        message: result.done ? undefined : result.message,
        messages: [...messages, { role: "assistant", content: replyContent }],
      });
    } catch (error) {
      console.error("Chat generation error:", error);
      res.status(500).json({ error: "Content generation failed" });
    }
  },
);

// POST /api/content/drafts — save an already-finalized chat caption to the
// queue. No AI call here; the content was already finalized via /chat.
router.post(
  "/drafts",
  [
    body("platform")
      .trim()
      .notEmpty()
      .isIn(VALID_PLATFORMS)
      .withMessage(`Platform must be one of: ${VALID_PLATFORMS.join(", ")}`),
    body("caption").trim().notEmpty().withMessage("Caption is required"),
    body("prompt").trim().notEmpty().withMessage("Prompt is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { platform, caption, prompt } = req.body;

      const draft = await ContentDraft.create({
        ministry_id: req.ministryId,
        prompt,
        platform,
        caption,
        generated_by: req.userId,
        status: "pending",
      });

      res.status(201).json(draft);
    } catch (error) {
      console.error("Draft save error:", error);
      res.status(500).json({ error: "Failed to save draft" });
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
router.put("/drafts/:id/approve", requireRole("admin", "leader"), async (req, res) => {
  try {
    const draft = await ContentDraft.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId },
      {
        status: "approved",
        approved_at: new Date(),
        approved_by: req.userId,
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
router.put("/drafts/:id/reject", requireRole("admin", "leader"), async (req, res) => {
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
  requireRole("admin", "leader"),
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
