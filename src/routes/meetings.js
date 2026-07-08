const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const MeetingTaskDraft = require("../models/MeetingTaskDraft");
const Task = require("../models/Task");
const User = require("../models/User");
const { requireRole } = require("../middleware/auth");
const { aiLimiter } = require("../middleware/rateLimiters");
const { notifyTaskAssigned } = require("../services/notificationService");
const {
  parseTranscriptText,
  extractTasksFromTranscript,
  matchAssignee,
  extractPdfText,
} = require("../services/meetingTaskService");
const { getOrgFamily } = require("../services/ministryService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — PDFs run larger than plain-text/.vtt
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

// Rosters are fetched and matched per-ministry, never merged into one
// flat list — two related ministries can have members with the same or
// overlapping names, and matchAssignee's exact/substring matching has no
// way to disambiguate across tenants. Keeping the map per-ministry_id
// means each task is only ever matched against the roster of whichever
// ministry it actually targets.
const fetchFamilyRosters = async (family) => {
  const entries = await Promise.all(
    family.map(async (m) => [m.ministry_id, await fetchTeamRoster(m.ministry_id)]),
  );
  return Object.fromEntries(entries);
};

// Resolves the AI's free-text ministry_name guess back to a real
// ministry_id, strictly from the provided family list — never trusts an
// AI-produced ministry_id directly. Defaults to the home ministry when
// omitted or when the name doesn't match anything in the family (a
// hallucinated or out-of-family name is treated the same as "not said").
const resolveTargetMinistry = (ministryName, family, homeMinistryId) => {
  if (!ministryName) return homeMinistryId;
  const match = family.find((m) => m.name.toLowerCase().trim() === ministryName.toLowerCase().trim());
  return match?.ministry_id || homeMinistryId;
};

// POST /api/meetings/transcript — upload a .vtt/.txt/.pdf file or paste
// text, AI extracts action items and matches them against the real team
// roster. Nothing here creates a real Task yet — every extracted item
// lands as pending_review.
router.post(
  "/transcript",
  requireRole("admin", "leader"),
  aiLimiter,
  upload.single("transcript"),
  [
    body("text").optional().trim(),
    body("meeting_title").optional().trim(),
    body("meeting_date").optional().isISO8601(),
  ],
  validate,
  async (req, res) => {
    try {
      let rawText;
      if (req.file?.mimetype === "application/pdf") {
        rawText = await extractPdfText(req.file.buffer);
      } else if (req.file) {
        rawText = req.file.buffer.toString("utf8");
      } else {
        rawText = req.body.text;
      }

      if (!rawText || !rawText.trim()) {
        return res.status(400).json({ error: "A transcript file or pasted text is required" });
      }

      const transcript = parseTranscriptText(rawText);
      const family = await getOrgFamily(req.ministryId);
      const rostersByMinistry = await fetchFamilyRosters(family);
      const homeRoster = rostersByMinistry[req.ministryId] || [];
      // Claude sees everyone in the family (for assignee context across
      // ministries) but each task is only ever matched against its own
      // resolved target ministry's roster below — never this merged view.
      const familyRosterForPrompt = Object.values(rostersByMinistry).flat();

      const extracted = await extractTasksFromTranscript(
        transcript,
        familyRosterForPrompt,
        req.body.meeting_date,
        family,
      );

      const tasks = extracted.map((t) => {
        const targetMinistryId = resolveTargetMinistry(t.ministry_name, family, req.ministryId);
        const targetRoster = rostersByMinistry[targetMinistryId] || homeRoster;
        const matched = matchAssignee(t.assignee_name, targetRoster);
        return {
          description: t.description,
          assignee_name_raw: t.assignee_name || null,
          matched_user_id: matched?._id || null,
          due_date: t.due_date ? new Date(t.due_date) : undefined,
          target_ministry_id: targetMinistryId,
          ministry_uncertain: !!t.ministry_uncertain,
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
    body("target_ministry_id").optional({ nullable: true }).trim(),
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
      if (req.body.target_ministry_id !== undefined) {
        const family = await getOrgFamily(req.ministryId);
        const inFamily = family.some((m) => m.ministry_id === req.body.target_ministry_id);
        if (!inFamily) {
          return res.status(400).json({ error: "That ministry isn't part of this org family" });
        }
        // Changing which ministry a task targets invalidates any existing
        // match — a person matched against the old ministry's roster
        // isn't necessarily even a member of the new one. Require the
        // reviewer to explicitly re-pick, rather than silently carrying a
        // stale match across ministries.
        if (task.target_ministry_id !== req.body.target_ministry_id) {
          task.matched_user_id = undefined;
        }
        task.target_ministry_id = req.body.target_ministry_id;
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
// Task, possibly in a different ministry than the one this request is
// authenticated against (when the task targets a related ministry in the
// org family). matched_user_id is re-validated against that target
// ministry's membership here rather than trusted from earlier matching,
// since a person could have left the ministry between extraction and
// review. Critically: being in the same org family is NOT, by itself,
// enough authority to write into another tenant — that's a fact about
// two Ministry records, not about this caller's own standing there. The
// caller must independently hold admin/leader membership in the target
// ministry too, the same bar every other route in this ministry enforces
// on its own members, so a leader in one ministry can never inject a
// task into a sibling/parent they aren't actually a leader/admin of.
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

      const targetMinistryId = extractedTask.target_ministry_id || req.ministryId;

      if (targetMinistryId !== req.ministryId) {
        const family = await getOrgFamily(req.ministryId);
        const inFamily = family.some((m) => m.ministry_id === targetMinistryId);
        if (!inFamily) {
          return res.status(400).json({ error: "That ministry isn't part of this org family" });
        }

        const caller = await User.findOne({ _id: req.userId });
        const callerMembership = caller?.getMembership(targetMinistryId);
        if (!callerMembership || !["admin", "leader"].includes(callerMembership.role)) {
          return res
            .status(403)
            .json({ error: "You must be an admin or leader of that ministry to approve a task into it" });
        }
      }

      const assignee = await User.findOne({
        _id: extractedTask.matched_user_id,
        "ministries.ministry_id": targetMinistryId,
      });
      if (!assignee) {
        return res.status(400).json({ error: "Assignee must be a member of the target ministry" });
      }

      const task = await Task.create({
        ministry_id: targetMinistryId,
        title: extractedTask.description,
        due_date: extractedTask.due_date || undefined,
        assigned_to: extractedTask.matched_user_id,
        assigned_by: req.userId.toString(),
      });
      await notifyTaskAssigned({ ministryId: targetMinistryId, task });

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
