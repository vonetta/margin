const mongoose = require('mongoose');

const ministrySchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, unique: true },
  // A sub-ministry (e.g. Salt & Light under KTM) is its own fully separate
  // tenant — own branding, voice, members — linked back to its parent only
  // for organizational display. Access is never inherited from the parent;
  // each tenant's membership is independent.
  parent_ministry_id: { type: String, default: null, index: true },
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
    },
    logo_url: { type: String }
  },
  plan: { type: String, enum: ['small', 'mid', 'enterprise'], default: 'small' },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ministry', ministrySchema);