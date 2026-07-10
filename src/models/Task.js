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

  status: { type: String, enum: ["open", "done", "on_hold"], default: "open" },
  completed_at: { type: Date },
  hold_reason: { type: String, trim: true },

  // A "shared" task (multiple people on one thing) is modeled as several
  // ordinary single-assignee Task documents that share a group_id —
  // deliberately NOT an array-of-assignees on one document. That would
  // mean every existing single-assignee task needs migrating, canManage
  // would need to be rewritten to scope to one array element (easy to
  // get wrong and let any co-assignee touch another's row), and
  // completing a recurring task would need cross-document consensus
  // logic that doesn't exist today. With group_id, each person's row is
  // a completely normal Task — canManage, complete, reopen, and
  // recurrence rollover all work unchanged, per person, independently.
  // Existing tasks simply have group_id: null.
  group_id: { type: String, default: null, index: true },

  // Dedup guards for the periodic reminder sweep (taskReminderService) —
  // not user-facing. due_soon fires once per task; overdue re-fires at
  // most once a day while the task stays overdue, so a stamp alone
  // (rather than a boolean) is what lets the sweep tell "already
  // reminded today" from "reminded a week ago, nudge again."
  due_soon_notified_at: { type: Date, default: null },
  overdue_notified_at: { type: Date, default: null },

  created_at: { type: Date, default: Date.now },
});

taskSchema.index({ ministry_id: 1, assigned_to: 1, status: 1 });

module.exports = mongoose.model("Task", taskSchema);
