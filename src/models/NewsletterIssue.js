const mongoose = require("mongoose");

// Every section type funnels through one of these shapes rather than 11
// bespoke ones — see newsletterSections.js's DEFAULT_SECTIONS for which
// type each slot uses. `content` is intentionally Mixed since the shape
// genuinely differs per type (a text_block's {body, photo_url} vs a
// calendar's {entries: [...]}).
const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ["text_block", "list_block", "birthdays", "calendar", "spotlight", "give_cta"],
    },
    title: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const newsletterIssueSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  theme: { type: String, trim: true },
  // Only one value today — Phase 2 adds more templates to choose from,
  // at which point this becomes a real choice rather than a fixed default.
  template: { type: String, enum: ["classic"], default: "classic" },
  sections: [sectionSchema],
  status: { type: String, enum: ["draft", "finalized"], default: "draft" },
  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

newsletterIssueSchema.index({ ministry_id: 1, year: 1, month: 1 });

module.exports = mongoose.model("NewsletterIssue", newsletterIssueSchema);
