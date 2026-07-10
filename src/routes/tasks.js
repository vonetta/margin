const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { body, query, validationResult } = require("express-validator");
const Task = require("../models/Task");
const User = require("../models/User");
const { requireRole } = require("../middleware/auth");
const { notifyTaskAssigned } = require("../services/notificationService");
const { isValidRecurrenceRule, nextOccurrenceAfter } = require("../services/calendarService");

const STATUSES = ["open", "done", "on_hold"];

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

const normalizeTitle = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");

// Deliberately simple (no external NLP dependency) — exact match after
// normalizing, one title containing the other, or most of the
// significant words (length > 2, so "the"/"to"/"a" don't count) overlap.
// Good enough to catch "Rent the van" vs "rent a van" without a real
// similarity library.
const titlesAreSimilar = (a, b) => {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const shared = [...wordsA].filter((w) => wordsB.has(w)).length;
  return shared / Math.max(wordsA.size, wordsB.size) >= 0.6;
};

// GET /api/tasks/similar?title= — checks this ministry's open/on-hold
// tasks for a similar title, so the create form can warn before making
// an accidental duplicate. No role gate — anyone who can create a task
// can check for one first; read-only, no data exposed beyond what
// GET /team-overview already would to an admin/leader (here everyone
// just gets title/assignee/status/due_date for the few matches, not the
// full task list).
router.get(
  "/similar",
  [query("title").trim().notEmpty()],
  validate,
  async (req, res) => {
    try {
      const candidates = await Task.find({
        ministry_id: req.ministryId,
        status: { $in: ["open", "on_hold"] },
      }).select("title assigned_to status due_date");

      const matches = candidates.filter((t) => titlesAreSimilar(t.title, req.query.title));
      const userIds = [...new Set(matches.map((t) => t.assigned_to))];
      const users = await User.find({ _id: { $in: userIds } }).select("name");
      const nameById = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));

      res.json(
        matches.slice(0, 5).map((t) => ({
          _id: t._id,
          title: t.title,
          status: t.status,
          due_date: t.due_date,
          assignee_name: nameById[t.assigned_to] || "Someone",
        })),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to check for similar tasks" });
    }
  },
);

// GET /api/tasks?status=&mine=
// mine=true (default) restricts to tasks assigned to the caller. Anyone
// can also see tasks they assigned to others via mine=false — there's no
// admin-only "see everything" here the way Events has, since task
// creation itself isn't role-gated.
//
// Multi-assignee tasks previously had no visibility outside the
// admin/leader-only "everyone" board (GET /team-overview) — a co-assignee
// couldn't even see who else was on their own shared task from this
// personal list. Each returned task with a group_id now carries a
// `siblings` array (the OTHER assignees on that same shared task, by
// name and status) — this only reveals who's already a visible party to
// a task the caller is themselves on, not any of that person's other,
// unrelated tasks, so it doesn't cross the same privacy line team-overview
// avoids by staying admin/leader-gated.
router.get(
  "/",
  [query("status").optional().isIn(STATUSES)],
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

      const groupIds = [...new Set(tasks.map((t) => t.group_id).filter(Boolean))];
      let siblingsByGroup = {};
      if (groupIds.length) {
        const siblingDocs = await Task.find({
          ministry_id: req.ministryId,
          group_id: { $in: groupIds },
        }).select("group_id assigned_to status");
        const userIds = [...new Set(siblingDocs.map((s) => s.assigned_to))];
        const users = await User.find({ _id: { $in: userIds } }).select("name");
        const nameById = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));
        siblingsByGroup = siblingDocs.reduce((acc, s) => {
          (acc[s.group_id] ||= []).push({
            task_id: s._id.toString(),
            user_id: s.assigned_to,
            name: nameById[s.assigned_to] || "Someone",
            status: s.status,
          });
          return acc;
        }, {});
      }

      const withSiblings = tasks.map((t) => {
        const obj = t.toObject();
        if (t.group_id) {
          obj.siblings = (siblingsByGroup[t.group_id] || []).filter((s) => s.user_id !== t.assigned_to);
        }
        return obj;
      });

      res.json(withSiblings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  },
);

// GET /api/tasks/team-overview?status=open|done|on_hold|active|all — every
// task in this ministry grouped by assignee ("active" — open+on_hold —
// by default, matching the board's "what's still being worked" view).
// Unlike GET /, which only ever shows the caller's own tasks (assigned
// to them or assigned by them), this is the "see where everyone stands"
// view, so it's admin/leader gated the way Events' pending-approval
// list already is. Keyed by user id (not name) so a client can use the
// key directly as a real assigned_to value — e.g. the Tasks board's
// add-a-co-assignee action.
router.get(
  "/team-overview",
  requireRole("admin", "leader"),
  // "active" is a query-only shorthand (open + on_hold — the board's
  // default working view) alongside the real per-task statuses and the
  // "all" (no filter, includes done) escape hatch.
  [query("status").optional().isIn([...STATUSES, "all", "active"])],
  validate,
  async (req, res) => {
    try {
      const filter = { ministry_id: req.ministryId };
      const status = req.query.status || "active";
      if (status === "active") {
        filter.status = { $in: ["open", "on_hold"] };
      } else if (status !== "all") {
        filter.status = status;
      }
      const tasks = await Task.find(filter).sort({ due_date: 1 });
      const userIds = [...new Set(tasks.map((t) => t.assigned_to))];
      const users = await User.find({ _id: { $in: userIds } }).select("name");
      const nameById = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));

      const grouped = {};
      for (const task of tasks) {
        const id = task.assigned_to;
        if (!grouped[id]) grouped[id] = { name: nameById[id] || "Unknown", tasks: [] };
        grouped[id].tasks.push(task);
      }
      res.json(grouped);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team overview" });
    }
  },
);

// A "shared" task with N people becomes N sibling Task documents, all
// sharing one group_id — see the comment on Task.group_id for why this
// shape was chosen over an array-of-assignees on one document.
const newGroupId = () => crypto.randomUUID();

// POST /api/tasks
// assigned_to may be a single id (today's shape, one document, no
// group_id — completely unchanged) or an array of ids (a shared task —
// one document per person, all sharing a fresh group_id).
router.post(
  "/",
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("assigned_to")
      .custom((value) => {
        const ids = Array.isArray(value) ? value : [value];
        return ids.length > 0 && ids.every((id) => typeof id === "string" && id.trim().length > 0);
      })
      .withMessage("assigned_to is required"),
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

      const assigneeIds = [...new Set(Array.isArray(assigned_to) ? assigned_to : [assigned_to])];

      for (const id of assigneeIds) {
        const eligible = await isMinistryMember(id, req.ministryId);
        if (!eligible) {
          return res.status(400).json({
            error: "assigned_to must be a member of this ministry",
          });
        }
      }

      const groupId = assigneeIds.length > 1 ? newGroupId() : null;
      const shared = {
        ministry_id: req.ministryId,
        title,
        description,
        due_date: due_date ? new Date(due_date) : undefined,
        recurrence_rule: recurrence_rule || undefined,
        assigned_by: req.userId.toString(),
        group_id: groupId,
      };

      const tasks = await Promise.all(
        assigneeIds.map((id) => Task.create({ ...shared, assigned_to: id })),
      );
      await Promise.all(tasks.map((task) => notifyTaskAssigned({ ministryId: req.ministryId, task })));

      if (tasks.length > 1) {
        res.status(201).json({ group_id: groupId, tasks });
      } else {
        res.status(201).json(tasks[0]);
      }
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

// POST /api/tasks/:id/assignees — adds a co-assignee to an existing
// task by creating a new sibling Task document (same title/description/
// due_date/recurrence_rule/ministry_id/assigned_by), sharing a group_id
// with the original. This is what both the kanban board's drag-to-a-
// column and its keyboard-alternative reassign control call — "add,"
// never "replace," so a task's existing assignees are never silently
// dropped. Removing someone is just DELETE on their own document.
router.post(
  "/:id/assignees",
  [body("user_id").trim().notEmpty().withMessage("user_id is required")],
  validate,
  async (req, res) => {
    try {
      const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
      if (!task) return res.status(404).json({ error: "Task not found" });
      if (!canManage(req, task)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const { user_id } = req.body;
      const eligible = await isMinistryMember(user_id, req.ministryId);
      if (!eligible) {
        return res.status(400).json({ error: "user_id must be a member of this ministry" });
      }
      if (user_id === task.assigned_to) {
        return res.status(400).json({ error: "That person is already assigned to this task" });
      }

      if (!task.group_id) {
        task.group_id = newGroupId();
        await task.save();
      }

      const newTask = await Task.create({
        ministry_id: req.ministryId,
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        recurrence_rule: task.recurrence_rule,
        assigned_by: task.assigned_by,
        group_id: task.group_id,
        assigned_to: user_id,
      });
      await notifyTaskAssigned({ ministryId: req.ministryId, task: newTask });

      res.status(201).json(newTask);
    } catch (error) {
      console.error("Add assignee error:", error);
      res.status(500).json({ error: "Failed to add assignee" });
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
    task.hold_reason = undefined;
    await task.save();

    // Each person's row rolls forward independently the moment THEY
    // finish — there's no "wait for every co-assignee" check. Simpler
    // (no cross-document consensus/race to get right) and avoids the
    // real problem a shared task with a slow co-assignee would
    // otherwise create: the fast finisher would see nothing next cycle.
    // The rolled-forward task keeps the same group_id, so it still
    // shows alongside a still-open sibling from the current occurrence.
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
          group_id: task.group_id,
        });
        await notifyTaskAssigned({ ministryId: req.ministryId, task: nextTask });
      }
    }

    res.json({ ...task.toObject(), next_task: nextTask });
  } catch (error) {
    res.status(500).json({ error: "Failed to complete task" });
  }
});

// PUT /api/tasks/:id/reopen — also used to come back off hold, since
// "open" is the only non-terminal state to return to either from.
router.put("/:id/reopen", async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canManage(req, task)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    task.status = "open";
    task.completed_at = undefined;
    task.hold_reason = undefined;
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: "Failed to reopen task" });
  }
});

// PUT /api/tasks/:id/hold — pauses a task without marking it done or
// reassigning it (e.g. blocked on someone else). Per-person, like every
// other status change here — one row, one person's state.
router.put(
  "/:id/hold",
  [body("reason").optional().trim()],
  validate,
  async (req, res) => {
    try {
      const task = await Task.findOne({ _id: req.params.id, ministry_id: req.ministryId });
      if (!task) return res.status(404).json({ error: "Task not found" });
      if (!canManage(req, task)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      task.status = "on_hold";
      task.hold_reason = req.body.reason || undefined;
      task.completed_at = undefined;
      await task.save();
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to put this task on hold" });
    }
  },
);

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
