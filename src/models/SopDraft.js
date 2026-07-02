const mongoose = require("mongoose");

// Separate from AiProfile.sops on purpose — a draft here must never affect
// what Content Studio's AI grounds itself on until an admin/leader
// explicitly approves it, so this can't just be a status flag on the same
// array the live generation prompt reads from.
const sopDraftSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  notes: { type: String },
  image_urls: [{ type: String }],
  image_keys: [{ type: String }],
  title: { type: String, required: true },
  content: { type: String, required: true },
  tags: [{ type: String }],
  status: {
    type: String,
    enum: ["pending_review", "approved", "rejected"],
    default: "pending_review",
  },
  created_by: { type: String },
  approved_by: { type: String },
  approved_at: { type: Date },
  created_at: { type: Date, default: Date.now },
  // Minimal audit trail for exports — this content can include payment
  // methods and vendor relationships, and there's no other logging
  // convention in this codebase to hook into yet.
  exports: [
    {
      by: { type: String },
      at: { type: Date, default: Date.now },
      mode: { type: String },
      _id: false,
    },
  ],
});

sopDraftSchema.index({ ministry_id: 1, status: 1 });
sopDraftSchema.index({ ministry_id: 1, created_at: -1 });

module.exports = mongoose.model("SopDraft", sopDraftSchema);
