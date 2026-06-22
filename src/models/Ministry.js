const mongoose = require('mongoose');

const ministrySchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  tagline: { type: String },
  website: { type: String },
  entity_boundary: { type: String },
  branding: {
    colors: {
      primary: { type: String },
      accent: { type: String },
      background: { type: String },
      text: { type: String },
      gold: { type: String }
    },
    fonts: {
      heading: { type: String },
      body: { type: String }
    },
    image_treatment: {
      text_overlay_opacity: { type: Number },
      image_only_opacity: { type: Number }
    }
  },
  plan: { type: String, enum: ['small', 'mid', 'enterprise'], default: 'small' },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ministry', ministrySchema);