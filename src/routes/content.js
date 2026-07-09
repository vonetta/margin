const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const { generateContent, chatTurn } = require("../services/generationService");
const { aiLimiter } = require("../middleware/rateLimiters");
const { extractFlyerDetails } = require("../services/imageService");
const { withApprovedSops } = require("../services/sopService");
const AiProfile = require("../models/AiProfile");
const ContentDraft = require("../models/ContentDraft");
const Ministry = require("../models/Ministry");
const { requireRole } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

const VALID_PLATFORMS = ["Instagram", "Facebook", "Email", "Quote card"];

// POST /api/content/generate
router.post(
  "/generate",
  aiLimiter,
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

      const profileWithSops = await withApprovedSops(profile, req.ministryId);
      const generatedCaption = await generateContent(
        prompt,
        profileWithSops,
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
  aiLimiter,
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

      const ministryIds = req.user.ministries.map((m) => m.ministry_id);
      const availableMinistries = await Ministry.find(
        { ministry_id: { $in: ministryIds } },
        "ministry_id name",
      );

      const profileWithSops = await withApprovedSops(profile, req.ministryId);
      const result = await chatTurn({
        profile: profileWithSops,
        ministry: req.ministry,
        platform,
        messages,
        availableMinistries,
      });

      const replyContent = result.done
        ? result.caption
        : result.switchTo
          ? result.switchTo.note
          : result.message;

      res.json({
        done: result.done,
        caption: result.done ? result.caption : undefined,
        event: result.done ? result.event : undefined,
        style: result.done ? result.style : undefined,
        tone: result.done ? result.tone : undefined,
        message: result.done || result.switchTo ? undefined : result.message,
        switchTo: result.switchTo || undefined,
        messages: [...messages, { role: "assistant", content: replyContent }],
      });
    } catch (error) {
      console.error("Chat generation error:", error);
      res.status(500).json({ error: "Content generation failed" });
    }
  },
);

// POST /api/content/extract-flyer — read an already-made flyer image and
// pull out its event details, so the chat doesn't ask the user to retype
// facts that are already on the flyer.
router.post(
  "/extract-flyer",
  upload.single("flyer"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const details = await extractFlyerDetails(
        req.file.buffer,
        req.file.mimetype,
      );

      res.json(details);
    } catch (error) {
      console.error("Flyer extraction error:", error);
      res.status(500).json({ error: "Failed to read details from the flyer" });
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
    body("image_url").optional().trim().isURL(),
  ],
  validate,
  async (req, res) => {
    try {
      const { platform, caption, prompt, image_url } = req.body;

      const draft = await ContentDraft.create({
        ministry_id: req.ministryId,
        prompt,
        platform,
        caption,
        image_url,
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
