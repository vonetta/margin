const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },

  // task_assigned: someone gave you a task.
  // event_pending_approval: a flyer-generated event is waiting on an
  // admin/leader to approve or reject it.
  type: {
    type: String,
    enum: ["task_assigned", "event_pending_approval"],
    required: true,
  },

  title: { type: String, required: true },
  body: { type: String },

  // Where the frontend should navigate on click — a route within the
  // app, not an external URL.
  link: { type: String },

  read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

notificationSchema.index({ ministry_id: 1, user_id: 1, read: 1, created_at: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
