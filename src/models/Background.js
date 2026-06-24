const mongoose = require("mongoose");

const backgroundSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  prompt: { type: String, required: true },
  url: { type: String, required: true },
  key: { type: String, required: true },
  tone: { type: String }, // optional tag: formal, warm, energetic
  created_by: { type: String }, // user id
  created_at: { type: Date, default: Date.now },
});

backgroundSchema.index({ ministry_id: 1, created_at: -1 });

module.exports = mongoose.model("Background", backgroundSchema);
