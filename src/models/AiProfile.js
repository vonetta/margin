const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema({
  title: { type: String },
  content: { type: String, required: true },
  tags: [{ type: String }],
  embedding: [{ type: Number }],
  updated_at: { type: Date, default: Date.now },
});

const aiProfileSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, unique: true },
  voice_profile: {
    persona_name: { type: String },
    sign_off: { type: String },
    tone_pillars: [{ type: String }],
    sample_phrases: [{ type: String }],
    avoid: [{ type: String }],
    registers: { type: Map, of: String },
  },
  sops: [chunkSchema],
  templates: [chunkSchema],
  recurring_content: [chunkSchema],
  platforms: [{ type: String }],
  platform_notes: { type: Map, of: String },
  hashtags: {
    brand: [{ type: String }],
    content: [{ type: String }],
  },
  ctas: { type: Map, of: String },
  visual_prohibitions: [{ type: String }],
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AiProfile", aiProfileSchema);
