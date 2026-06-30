const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  location: { type: String, trim: true },

  // The first/anchor occurrence. For a recurring event, recurrence_rule
  // expands forward from this start.
  start: { type: Date, required: true },
  end: { type: Date },
  all_day: { type: Boolean, default: false },

  // An RRULE string (RFC 5545 — the same format iCal/Google/Outlook use),
  // e.g. "FREQ=WEEKLY;BYDAY=TU,TH" for a twice-weekly prayer call. Built
  // and parsed with the rrule package on both the expansion and the iCal
  // feed side, so "full custom recurrence" doesn't mean hand-rolled
  // recurrence math — null means a one-off event.
  recurrence_rule: { type: String },

  // internal: only visible to logged-in team members of this ministry.
  // public: also included in the public .ics feed (e.g. embedded on the
  // ministry's WordPress site) — congregants, not just staff, can see it.
  visibility: {
    type: String,
    enum: ["internal", "public"],
    default: "internal",
  },

  // Events created automatically from a generated flyer land here as
  // "pending" rather than going straight onto the calendar — someone
  // still has to confirm the parsed date/details are right before it's
  // real. Manually created events skip straight to "approved".
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "approved",
  },

  source: { type: String, enum: ["manual", "flyer"], default: "manual" },
  flyer_id: { type: String }, // set when source === "flyer"

  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

eventSchema.index({ ministry_id: 1, start: 1 });
eventSchema.index({ ministry_id: 1, status: 1 });
eventSchema.index({ ministry_id: 1, visibility: 1, status: 1 });

module.exports = mongoose.model("Event", eventSchema);
