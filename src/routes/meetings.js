const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const MeetingTaskDraft = require("../models/MeetingTaskDraft");
const Task = require("../models/Task");
const User = require("../models/User");
const { requireRole } = require("../middleware/auth");
const { notifyTaskAssigned } = require("../services/notificationService");
const {
  parseTranscriptText,
  extractTasksFromTranscript,
  matchAssignee,
} = require("../services/meetingTaskService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — a transcript is text, not media
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const fetchTeamRoster = async (ministryId) => {
  const users = await User.find({
    "ministries.ministry_id": ministryId,
    is_active: true,
  }).select("name");
  return users.map((u) => ({ _id: u._id.toString(), name: u.name }));
};

// POST /api/meetings/transcript — upload a .vtt/.txt file or paste text,
// AI extracts action items and matches them against the real team roster.
// Nothing here creates a real Task yet — every extracted item lands as
// pending_review.
router.post(
  "/transcript",
  requireRole("admin", "leader"),
  upload.single("transcript"),
  [
    body("text").optional().trim(),
    body("meeting_title").optional().trim(),
    body("meeting_date").optional().isISO8601(),
  ],
  validate,
  async (req, res) => {
    try {
      const rawText = req.file ? req.file.buffer.toString("utf8") : req.body.text;
      if (!rawText || !rawText.trim()) {
        return res.status(400).json({ error: "A transcript file or pasted text is required" });
      }

      const transcript = parseTranscriptText(rawText);
      const teamRoster = await fetchTeamRoster(req.ministryId);

      const extracted = await extractTasksFromTranscript(
        transcript,
        teamRoster,
        req.body.meeting_date,
      );

      const tasks = extracted.map((t) => {
        const matched = matchAssignee(t.assignee_name, teamRoster);
        return {
          description: t.description,
          assignee_name_raw: t.assignee_name || null,
          matched_user_id: matched?._id || null,
          due_date: t.due_date ? new Date(t.due_date) : undefined,
          status: "pending_review",
        };
      });

      const draft = await MeetingTaskDraft.create({
        ministry_id: req.ministryId,
        meeting_title: req.body.meeting_title || undefined,
        meeting_date: req.body.meeting_date ? new Date(req.body.meeting_date) : undefined,
        transcript,
        tasks,
        created_by: req.userId,
      });

      res.status(201).json(draft);
    } catch (error) {
      console.error("Meeting transcript extraction error:", error);
      res.status(500).json({ error: "Failed to extract tasks from this transcript" });
    }
  },
);

// GET /api/meetings/transcripts
router.get("/transcripts", requireRole("admin", "leader"), async (req, res) => {
  try {
    const drafts = await MeetingTaskDraft.find({ ministry_id: req.ministryId })
      .select("-transcript")
      .sort({ created_at: -1 });
    res.json(drafts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch meeting transcripts" });
  }
});

// GET /api/meetings/transcripts/:id — includes the full transcript, unlike
// the list view above.
router.get("/transcripts/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const draft = await MeetingTaskDraft.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!draft) return res.status(404).json({ error: "Meeting transcript not found" });
    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch meeting transcript" });
  }
});

// PUT /api/meetings/transcripts/:id/tasks/:taskId — edit an extracted task
// before approving (description, due date, or fix a wrong/missing match).
router.put(
  "/transcripts/:id/tasks/:taskId",
  requireRole("admin", "leader"),
  [
    body("description").optional().trim().notEmpty(),
    body("due_date").optional({ nullable: true }).isISO8601(),
    body("matched_user_id").optional({ nullable: true }).trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const draft = await MeetingTaskDraft.findOne({
        _id: req.params.id,
        ministry_id: req.ministryId,
      });
      if (!draft) return res.status(404).json({ error: "Meeting transcript not found" });

      const task = draft.tasks.id(req.params.taskId);
      if (!task) return res.status(404).json({ error: "Extracted task not found" });

      if (req.body.description !== undefined) task.description = req.body.description;
      if (req.body.due_date !== undefined) {
        task.due_date = req.body.due_date ? new Date(req.body.due_date) : undefined;
      }
      if (req.body.matched_user_id !== undefined) {
        task.matched_user_id = req.body.matched_user_id || undefined;
      }

      await draft.save();
      res.json(draft);
    } catch (error) {
      res.status(500).json({ error: "Failed to update this task" });
    }
  },
);

// PUT /api/meetings/transcripts/:id/tasks/:taskId/approve — creates a real
// Task. matched_user_id is re-validated against ministry membership here
// rather than trusted from earlier matching, since a person could have
// left the ministry between extraction and review.
router.put(
  "/transcripts/:id/tasks/:taskId/approve",
  requireRole("admin", "leader"),
  async (req, res) => {
    try {
      const draft = await MeetingTaskDraft.findOne({
        _id: req.params.id,
        ministry_id: req.ministryId,
      });
      if (!draft) return res.status(404).json({ error: "Meeting transcript not found" });

      const extractedTask = draft.tasks.id(req.params.taskId);
      if (!extractedTask) return res.status(404).json({ error: "Extracted task not found" });
      if (!extractedTask.matched_user_id) {
        return res.status(400).json({ error: "Assign this task to a team member before approving" });
      }

      const assignee = await User.findOne({
        _id: extractedTask.matched_user_id,
        "ministries.ministry_id": req.ministryId,
      });
      if (!assignee) {
        return res.status(400).json({ error: "Assignee must be a member of this ministry" });
      }

      const task = await Task.create({
        ministry_id: req.ministryId,
        title: extractedTask.description,
        due_date: extractedTask.due_date || undefined,
        assigned_to: extractedTask.matched_user_id,
        assigned_by: req.userId.toString(),
      });
      await notifyTaskAssigned({ ministryId: req.ministryId, task });

      extractedTask.status = "approved";
      extractedTask.task_id = task._id.toString();
      await draft.save();

      res.json(draft);
    } catch (error) {
      console.error("Task approval error:", error);
      res.status(500).json({ error: "Failed to approve this task" });
    }
  },
);

// PUT /api/meetings/transcripts/:id/tasks/:taskId/reject
router.put(
  "/transcripts/:id/tasks/:taskId/reject",
  requireRole("admin", "leader"),
  async (req, res) => {
    try {
      const draft = await MeetingTaskDraft.findOne({
        _id: req.params.id,
        ministry_id: req.ministryId,
      });
      if (!draft) return res.status(404).json({ error: "Meeting transcript not found" });

      const extractedTask = draft.tasks.id(req.params.taskId);
      if (!extractedTask) return res.status(404).json({ error: "Extracted task not found" });

      extractedTask.status = "rejected";
      await draft.save();
      res.json(draft);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject this task" });
    }
  },
);

// DELETE /api/meetings/transcripts/:id — deletes the whole batch. Tasks
// already approved from it remain (they're real Task documents now,
// independent of this draft).
router.delete("/transcripts/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const draft = await MeetingTaskDraft.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!draft) return res.status(404).json({ error: "Meeting transcript not found" });
    await MeetingTaskDraft.deleteOne({ _id: draft._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete this meeting transcript" });
  }
});

module.exports = router;
