const mongoose = require("mongoose");

const emailDraftSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ["invitation", "confirmation", "reminder", "thank_you"],
  },
  recipient_person_id: { type: String }, // optional ref to an existing Person
  recipient_name: { type: String, required: true, trim: true },
  recipient_email: { type: String, trim: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  status: {
    type: String,
    enum: ["draft", "sent"], // "sent" reserved for when actual sending ships
    default: "draft",
  },
  generated_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

emailDraftSchema.index({ ministry_id: 1, created_at: -1 });
emailDraftSchema.index({ ministry_id: 1, type: 1 });

module.exports = mongoose.model("EmailDraft", emailDraftSchema);
