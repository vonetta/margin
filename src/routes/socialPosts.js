const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const SocialPost = require("../models/SocialPost");
const SocialAccount = require("../models/SocialAccount");
const { requireRole } = require("../middleware/auth");
const { schedulePost, cancelScheduledPost } = require("../services/socialPostScheduler");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// A target's social_account_id must belong to this ministry, and an
// instagram target specifically needs that account to actually have an
// Instagram Business account linked — otherwise this fails at approval
// time with a clear error instead of silently failing when the
// scheduler tries to publish it later.
const validateTargets = async (targets, ministryId) => {
  for (const target of targets) {
    const account = await SocialAccount.findOne({
      _id: target.social_account_id,
      ministry_id: ministryId,
    });
    if (!account) return `Connected account ${target.social_account_id} not found`;
    if (target.platform === "instagram" && !account.instagram_business_account_id) {
      return `${account.page_name} has no linked Instagram account`;
    }
  }
  return null;
};

// GET /api/social-posts?status=
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { ministry_id: req.ministryId };
    if (status) filter.status = status;
    const posts = await SocialPost.find(filter).sort({ created_at: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch social posts" });
  }
});

// POST /api/social-posts — lands in pending_approval; targets and
// scheduled_time are chosen at approval time, not creation time.
router.post(
  "/",
  requireRole("admin", "leader"),
  [
    body("caption").trim().notEmpty().withMessage("Caption is required"),
    body("graphic_urls").isArray({ min: 1 }).withMessage("At least one graphic URL is required"),
    body("post_type").isIn(["image", "carousel", "video", "reel"]).withMessage("Invalid post type"),
    body("flyer_id").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const post = await SocialPost.create({
        ministry_id: req.ministryId,
        flyer_id: req.body.flyer_id || undefined,
        caption: req.body.caption,
        graphic_urls: req.body.graphic_urls,
        post_type: req.body.post_type,
        created_by: req.userId.toString(),
      });
      res.status(201).json(post);
    } catch (error) {
      console.error("Social post creation error:", error);
      res.status(500).json({ error: "Failed to create social post" });
    }
  },
);

// PUT /api/social-posts/:id/approve
router.put(
  "/:id/approve",
  requireRole("admin", "leader"),
  [
    body("targets").isArray({ min: 1 }).withMessage("At least one target account is required"),
    body("targets.*.social_account_id").trim().notEmpty(),
    body("targets.*.platform").isIn(["facebook", "instagram"]),
    body("scheduled_time").isISO8601().withMessage("A valid scheduled_time is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const post = await SocialPost.findOne({ _id: req.params.id, ministry_id: req.ministryId });
      if (!post) return res.status(404).json({ error: "Social post not found" });

      const targetError = await validateTargets(req.body.targets, req.ministryId);
      if (targetError) return res.status(400).json({ error: targetError });

      post.targets = req.body.targets;
      post.scheduled_time = new Date(req.body.scheduled_time);
      post.status = "approved";
      post.approved_by = req.userId.toString();
      await post.save();

      schedulePost(post);
      res.json(post);
    } catch (error) {
      console.error("Social post approval error:", error);
      res.status(500).json({ error: "Failed to approve social post" });
    }
  },
);

// PUT /api/social-posts/:id/reject
router.put("/:id/reject", requireRole("admin", "leader"), async (req, res) => {
  try {
    const post = await SocialPost.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId },
      { status: "rejected" },
      { returnDocument: "after" },
    );
    if (!post) return res.status(404).json({ error: "Social post not found" });
    cancelScheduledPost(post._id);
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: "Failed to reject social post" });
  }
});

// PUT /api/social-posts/:id — editing an approved-but-not-yet-posted
// post (e.g. pushing the schedule back) needs to reschedule its timer,
// not just update the record underneath a timer that's already set for
// the old time.
router.put(
  "/:id",
  requireRole("admin", "leader"),
  [
    body("caption").optional().trim().notEmpty(),
    body("graphic_urls").optional().isArray({ min: 1 }),
    body("post_type").optional().isIn(["image", "carousel", "video", "reel"]),
    body("targets").optional().isArray({ min: 1 }),
    body("scheduled_time").optional().isISO8601(),
  ],
  validate,
  async (req, res) => {
    try {
      const post = await SocialPost.findOne({ _id: req.params.id, ministry_id: req.ministryId });
      if (!post) return res.status(404).json({ error: "Social post not found" });
      if (post.status === "posted") {
        return res.status(400).json({ error: "A post that's already gone out can't be edited" });
      }

      if (req.body.targets) {
        const targetError = await validateTargets(req.body.targets, req.ministryId);
        if (targetError) return res.status(400).json({ error: targetError });
      }

      for (const field of ["caption", "graphic_urls", "post_type", "targets"]) {
        if (req.body[field] !== undefined) post[field] = req.body[field];
      }
      if (req.body.scheduled_time !== undefined) {
        post.scheduled_time = new Date(req.body.scheduled_time);
      }
      await post.save();

      if (post.status === "approved" && post.scheduled_time) {
        schedulePost(post);
      }

      res.json(post);
    } catch (error) {
      console.error("Social post update error:", error);
      res.status(500).json({ error: "Failed to update social post" });
    }
  },
);

// DELETE /api/social-posts/:id
router.delete("/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const post = await SocialPost.findOneAndDelete({ _id: req.params.id, ministry_id: req.ministryId });
    if (!post) return res.status(404).json({ error: "Social post not found" });
    cancelScheduledPost(post._id);
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete social post" });
  }
});

module.exports = router;
