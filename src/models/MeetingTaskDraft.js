const mongoose = require("mongoose");

// One extracted action item from a transcript. Kept separate from the real
// Task model until approved — a misheard name or a hallucinated action item
// shouldn't silently land on someone's real task list, same principle as
// SopDraft's pending_review gate before anything affects AI grounding.
const extractedTaskSchema = new mongoose.Schema({
  description: { type: String, required: true },
  assignee_name_raw: { type: String }, // exactly what the AI read off the transcript
  matched_user_id: { type: String }, // resolved against the ministry's real team roster, if matched
  due_date: { type: Date },
  status: {
    type: String,
    enum: ["pending_review", "approved", "rejected"],
    default: "pending_review",
  },
  task_id: { type: String }, // set once approved and a real Task exists
});

const meetingTaskDraftSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  meeting_title: { type: String },
  meeting_date: { type: Date },
  transcript: { type: String, required: true },
  tasks: [extractedTaskSchema],
  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

meetingTaskDraftSchema.index({ ministry_id: 1, created_at: -1 });

module.exports = mongoose.model("MeetingTaskDraft", meetingTaskDraftSchema);
