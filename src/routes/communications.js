const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { emailChatTurn } = require("../services/emailService");
const AiProfile = require("../models/AiProfile");
const EmailDraft = require("../models/EmailDraft");
const Person = require("../models/Person");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const VALID_TYPES = ["invitation", "confirmation", "reminder", "thank_you"];

// POST /api/communications/chat — one turn of a back-and-forth email
// conversation. Mirrors /api/content/chat's shape: the model either asks a
// clarifying question (done: false) or finalizes via a tool call
// (done: true). The client owns the message history.
router.post(
  "/chat",
  [
    body("type")
      .trim()
      .notEmpty()
      .withMessage("Email type is required")
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(", ")}`),
    body("recipient_name").trim().notEmpty().withMessage("Recipient name is required"),
    body("messages")
      .isArray({ min: 1 })
      .withMessage("messages must be a non-empty array"),
    body("messages.*.role").isIn(["user", "assistant"]),
    body("messages.*.content").trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const { type, recipient_name, messages } = req.body;

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

      const result = await emailChatTurn({
        profile,
        ministry: req.ministry,
        emailType: type,
        recipientName: recipient_name,
        messages,
      });

      const replyContent = result.done ? result.body : result.message;

      res.json({
        done: result.done,
        subject: result.done ? result.subject : undefined,
        body: result.done ? result.body : undefined,
        message: result.done ? undefined : result.message,
        messages: [...messages, { role: "assistant", content: replyContent }],
      });
    } catch (error) {
      console.error("Email chat generation error:", error);
      res.status(500).json({ error: "Email generation failed" });
    }
  },
);

// POST /api/communications/drafts — save an already-finalized email draft
router.post(
  "/drafts",
  [
    body("type").trim().notEmpty().isIn(VALID_TYPES),
    body("recipient_name").trim().notEmpty(),
    body("recipient_email").optional().trim().isEmail(),
    body("recipient_person_id").optional().trim(),
    body("subject").trim().notEmpty(),
    body("body").trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      let recipientEmail = req.body.recipient_email;
      if (req.body.recipient_person_id) {
        const person = await Person.findOne({
          _id: req.body.recipient_person_id,
          ministry_id: req.ministryId,
        });
        if (person?.email) recipientEmail = recipientEmail || person.email;
      }

      const draft = await EmailDraft.create({
        ministry_id: req.ministryId,
        type: req.body.type,
        recipient_person_id: req.body.recipient_person_id || undefined,
        recipient_name: req.body.recipient_name,
        recipient_email: recipientEmail,
        subject: req.body.subject,
        body: req.body.body,
        generated_by: req.userId,
      });

      res.status(201).json(draft);
    } catch (error) {
      console.error("Email draft save error:", error);
      res.status(500).json({ error: "Failed to save email draft" });
    }
  },
);

// GET /api/communications/drafts
router.get("/drafts", async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { ministry_id: req.ministryId };
    if (type) filter.type = type;

    const drafts = await EmailDraft.find(filter).sort({ created_at: -1 }).limit(50);
    res.json(drafts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch email drafts" });
  }
});

// DELETE /api/communications/drafts/:id
router.delete("/drafts/:id", async (req, res) => {
  try {
    const draft = await EmailDraft.findOneAndDelete({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete draft" });
  }
});

module.exports = router;
