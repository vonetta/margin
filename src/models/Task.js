const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  due_date: { type: Date },

  // An RRULE string, same format/parsing as Event.recurrence_rule
  // (calendarService's RRule helpers are shared). due_date is the
  // recurrence anchor, so a recurring task requires one. Unlike events,
  // occurrences aren't expanded for display — completing a recurring
  // task rolls a single new "open" Task forward to the next due date
  // (see routes/tasks.js's complete handler) rather than pre-materializing
  // every future occurrence, since a task has real per-occurrence state
  // (who it's assigned to, whether it got reassigned) that a virtual
  // expansion can't carry.
  recurrence_rule: { type: String },

  // Both must be members of ministry_id at creation time — assignment is
  // scoped to "people you actually work with in this ministry," not a
  // free-for-all across the whole app.
  assigned_to: { type: String, required: true },
  assigned_by: { type: String, required: true },

  status: { type: String, enum: ["open", "done"], default: "open" },
  completed_at: { type: Date },

  created_at: { type: Date, default: Date.now },
});

taskSchema.index({ ministry_id: 1, assigned_to: 1, status: 1 });

module.exports = mongoose.model("Task", taskSchema);
