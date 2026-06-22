const mongoose = require('mongoose');

const contentDraftSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  prompt: { type: String, required: true },
  platform: {
    type: String,
    required: true,
    enum: ['Instagram', 'Facebook', 'Email', 'Quote card']
  },
  caption: { type: String, required: true },
  image_url: { type: String },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  generated_by: { type: String, default: 'team' },
  approved_by: { type: String },
  approved_at: { type: Date },
  feedback: { type: String },
  created_at: { type: Date, default: Date.now }
});

contentDraftSchema.index({ ministry_id: 1, status: 1 });
contentDraftSchema.index({ ministry_id: 1, created_at: -1 });

module.exports = mongoose.model('ContentDraft', contentDraftSchema);