const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  due_date: { type: Date },

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
