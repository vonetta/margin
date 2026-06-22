const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema({
  title: { type: String },
  content: { type: String, required: true },
  tags: [{ type: String }],
  embedding: [{ type: Number }],
  updated_at: { type: Date, default: Date.now },
});

const fontSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    roles: [{ type: String, enum: ["display", "body", "accent", "script"] }],
    tones: [{ type: String }],
    google_font: { type: Boolean, default: true },
    weights: [{ type: String }],
  },
  { _id: false },
);

const typeSystemSchema = new mongoose.Schema(
  {
    fonts: [fontSchema],
    default_display: { type: String },
    default_body: { type: String },
    tone_keywords: { type: Map, of: [String] },
  },
  { _id: false },
);

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
  type_system: typeSystemSchema,
});

module.exports = mongoose.model("AiProfile", aiProfileSchema);
