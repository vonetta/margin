const mongoose = require("mongoose");

const flyerSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  title: { type: String, required: true },
  layout: { type: String, required: true },
  tone: { type: String },
  // rendered outputs
  social_url: { type: String },
  social_key: { type: String },
  print_url: { type: String },
  print_key: { type: String },
  // what it was built from (for re-generation / history)
  content: { type: Object },
  host_id: { type: String },
  speaker_ids: [{ type: String }],
  background_id: { type: String },
  qr_url: { type: String },
  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

flyerSchema.index({ ministry_id: 1, created_at: -1 });

module.exports = mongoose.model("Flyer", flyerSchema);
