const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const Task = require("../models/Task");
const User = require("../models/User");
const { requireRole } = require("../middleware/auth");
const { notifyTaskAssigned } = require("../services/notificationService");
const { isValidRecurrenceRule, nextOccurrenceAfter } = require("../services/calendarService");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// A task's assignee must actually be a member of this ministry — that's
// the "your own team" boundary, since there's no separate sub-team
// concept in the data model yet.
const isMinistryMember = async (userId, ministryId) => {
  const user = await User.findOne({
    _id: userId,
    "ministries.ministry_id": ministryId,
  });
  return !!user;
};

// GET /api/tasks?status=&mine=
// mine=true (default) restricts to tasks assigned to the caller. Anyone
// can also see tasks they assigned to others via mine=false — there's no
// admin-only "see everything" here the way Events has, since task
// creation itself isn't role-gated.
router.get(
  "/",
  [query("status").optional().isIn(["open", "done"])],
  validate,
  async (req, res) => {
    try {
      const { status, mine } = req.query;
      const filter = { ministry_id: req.ministryId };
      if (status) filter.status = status;
      if (mine === "false") {
        filter.assigned_by = req.userId.toString();
      } else {
        filter.assigned_to = req.userId.toString();
      }

      const tasks = await Task.find(filter).sort({ due_date: 1, created_at: -1 });
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  },
);

// GET /api/tasks/team-overview — every open task in this ministry grouped
// by assignee. Unlike GET /, which only ever shows the caller's own tasks
// (assigned to them or assigned by them), this is the "see where everyone
// stands" view, so it's admin/leader gated the way Events' pending-approval
// list already is.
router.get("/team-overview", requireRole("admin", "leader"), async (req, res) => {
  try {
    const tasks = await Task.find({ ministry_id: req.ministryId, status: "open" }).sort({
      due_date: 1,
    });
    const userIds = [...new Set(tasks.map((t) => t.assigned_to))];
    const users = await User.find({ _id: { $in: userIds } }).select("name");
    const nameById = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));

    const grouped = {};
    for (const task of tasks) {
      const name = nameById[task.assigned_to] || "Unknown";
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(task);
    }
    res.json(grouped);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch team overview" });
  }
});

// POST /api/tasks
router.post(
  "/",
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("assigned_to").trim().notEmpty().withMessage("assigned_to is required"),
    body("description").optional().trim(),
    body("due_date").optional().isISO8601(),
    body("recurrence_rule")
      .optional({ nullable: true })
      .trim()
      .custom((value) => {
        if (value && !isValidRecurrenceRule(value)) {
          throw new Error("recurrence_rule is not a valid recurrence pattern");
        }
        return true;
      }),
  ],
  validate,
  async (req, res) => {
    try {
      const { title, description, due_date, assigned_to, recurrence_rule } = req.body;

      if (recurrence_rule && !due_date) {
        return res.status(400).json({ error: "A recurring task needs a due_date to anchor the recurrence" });
      }

      const eligible = await isMinistryMember(assigned_to, req.ministryId);
      if (!eligible) {
        return res.status(400).json({
          error: "assigned_to must be a member of this ministry",
        });
      }

      const task = await Task.create({
        ministry_id: req.ministryId,
        title,
        description,
        due_date: due_date ? new Date(due_date) : undefined,
        recurrence_rule: recurrence_rule || undefined,
        assigned_to,
        assigned_by: req.userId.toString(),
      });
      await notifyTaskAssigned({ ministryId: req.ministryId, task });
      res.status(201).json(task);
    } catch (error) {
      console.error("Task creation error:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  },
);

// Only the assignee, the original assigner, or an admin/leader can touch
// a task — everyone else on the roster has no business changing it.
const canManage = (req, task) => {
  const uid = req.userId.toString();
  return (
    task.assigned_to === uid ||
    task.assigned_by === uid ||
    req.userRole === "admin" ||
    req.userRole === "leader"
  );
};

// PUT /api/tasks/:id
router.put(
  "/:id",
  [
    body("title").optional().trim().notEmpty(),
    body("description").optional().trim(),
    body("due_date").optional().isISO8601(),
    body("assigned_to").optional().trim().notEmpty(),
    body("recurrence_rule")
      .optional({ nullable: true })
      .trim()
      .custom((value) => {
        if (value && !isValidRecurrenceRule(value)) {
          throw new Error("recurrence_rule is not a valid recurrence pattern");
        }
        return true;
      }),
  ],
  validate,
  async (req, res) => {
    try {
      const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
      if (!task) return res.status(404).json({ error: "Task not found" });
      if (!canManage(req, task)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      if (req.body.assigned_to) {
        const eligible = await isMinistryMember(req.body.assigned_to, req.ministryId);
        if (!eligible) {
          return res.status(400).json({ error: "assigned_to must be a member of this ministry" });
        }
      }

      const updates = { ...req.body };
      if (updates.due_date) updates.due_date = new Date(updates.due_date);

      const reassigned = updates.assigned_to && updates.assigned_to !== task.assigned_to;
      Object.assign(task, updates);
      await task.save();
      if (reassigned) {
        await notifyTaskAssigned({ ministryId: req.ministryId, task });
      }
      res.json(task);
    } catch (error) {
      console.error("Task update error:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  },
);

// PUT /api/tasks/:id/complete
// Completing a recurring task also rolls a fresh "open" task forward to
// the next occurrence (same title/description/assignee), rather than
// expanding occurrences virtually the way Calendar events do — a task
// carries real per-occurrence state (who it ended up assigned to) that
// only makes sense once the prior occurrence is actually done.
router.put("/:id/complete", async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canManage(req, task)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    task.status = "done";
    task.completed_at = new Date();
    await task.save();

    let nextTask = null;
    if (task.recurrence_rule && task.due_date) {
      const nextDue = nextOccurrenceAfter(task.recurrence_rule, task.due_date, task.due_date);
      if (nextDue) {
        nextTask = await Task.create({
          ministry_id: req.ministryId,
          title: task.title,
          description: task.description,
          due_date: nextDue,
          recurrence_rule: task.recurrence_rule,
          assigned_to: task.assigned_to,
          assigned_by: task.assigned_by,
        });
        await notifyTaskAssigned({ ministryId: req.ministryId, task: nextTask });
      }
    }

    res.json({ ...task.toObject(), next_task: nextTask });
  } catch (error) {
    res.status(500).json({ error: "Failed to complete task" });
  }
});

// PUT /api/tasks/:id/reopen
router.put("/:id/reopen", async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canManage(req, task)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    task.status = "open";
    task.completed_at = undefined;
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: "Failed to reopen task" });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canManage(req, task)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    await Task.deleteOne({ _id: task._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

module.exports = router;
