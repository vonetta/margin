const mongoose = require("mongoose");

const socialPostSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },

  // A generated flyer is the common source of the graphic, but not
  // required — a post can be built from a manually supplied image/video
  // URL instead.
  flyer_id: { type: String },

  caption: { type: String, required: true, trim: true },
  graphic_urls: [{ type: String, required: true }],
  post_type: {
    type: String,
    enum: ["image", "carousel", "video", "reel"],
    required: true,
  },

  // Which connected accounts (and which surface on each — a SocialAccount
  // covers both its Facebook Page and any linked Instagram account) this
  // goes out to. Chosen at approval time, not creation time — a post can
  // sit pending without a target yet decided.
  targets: [
    {
      social_account_id: { type: String, required: true },
      platform: { type: String, enum: ["facebook", "instagram"], required: true },
      _id: false,
    },
  ],

  // Required once approved — this is what the scheduler keys off of to
  // set an exact-time timer, not a polling sweep.
  scheduled_time: { type: Date },

  status: {
    type: String,
    enum: ["pending_approval", "approved", "posted", "failed", "rejected"],
    default: "pending_approval",
  },

  // One entry per target once the scheduler actually attempts to post —
  // a post can partially succeed (e.g. Facebook posts, Instagram fails).
  post_results: [
    {
      social_account_id: String,
      platform: String,
      status: { type: String, enum: ["success", "failed"] },
      external_post_id: String,
      error: String,
      posted_at: Date,
      _id: false,
    },
  ],

  created_by: { type: String, required: true },
  approved_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

socialPostSchema.index({ ministry_id: 1, status: 1 });
socialPostSchema.index({ status: 1, scheduled_time: 1 });

module.exports = mongoose.model("SocialPost", socialPostSchema);
