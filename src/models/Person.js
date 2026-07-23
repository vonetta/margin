const mongoose = require("mongoose");

const personSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  role: {
    type: String,
    enum: ["host", "speaker", "leader", "member", "staff"],
    default: "member",
  },
  headshot_url: { type: String }, // original uploaded photo
  headshot_key: { type: String },
  cutout_url: { type: String }, // transparent cut-out for flyers
  cutout_key: { type: String },
  bio: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  birthdate: { type: Date },
  // Distinct from `active` — a person can be on the roster without ever
  // having agreed to have their birthday broadcast in a public-facing
  // newsletter. Defaults false: adding a birthdate does nothing on its
  // own, this must be explicitly turned on per person.
  newsletter_birthday_consent: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
});

personSchema.index({ ministry_id: 1, role: 1 });
personSchema.index({ ministry_id: 1, name: 1 });

module.exports = mongoose.model("Person", personSchema);
