// Periodic sweep for task due/overdue reminders — the first "fires on
// its own over time" mechanism in this codebase. Every other
// notification (task_assigned, event_pending_approval) is triggered
// synchronously by a user's own action inside a route handler; nothing
// here reacts to a request. A simple interval-driven sweep (not a
// per-task timer the way socialPostScheduler does for exact publish
// times) is the right shape for this: due/overdue reminders don't need
// second-level precision, and a periodic query is far simpler to reason
// about than tracking potentially thousands of individual task timers.
const Task = require("../models/Task");
const { notifyTaskDueSoon, notifyTaskOverdue } = require("./notificationService");

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000; // notify once a task is within 24h of due
const OVERDUE_RENOTIFY_MS = 24 * 60 * 60 * 1000; // re-nudge at most once a day while overdue

const ACTIVE_STATUSES = ["open", "on_hold"];

// due_soon_notified_at is a one-time stamp (never cleared) — a task only
// gets a single "due soon" nudge ever, not one per sweep while it
// remains in the window.
const sweepDueSoon = async () => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DUE_SOON_WINDOW_MS);

  const tasks = await Task.find({
    status: { $in: ACTIVE_STATUSES },
    due_date: { $gte: now, $lte: windowEnd },
    due_soon_notified_at: null,
  });

  for (const task of tasks) {
    await notifyTaskDueSoon({ ministryId: task.ministry_id, task });
    task.due_soon_notified_at = now;
    await task.save();
  }
  return tasks.length;
};

// overdue_notified_at re-arms after OVERDUE_RENOTIFY_MS — a task left
// overdue for a week gets nudged again, not just once and then silence,
// but never more than once a day regardless of how often the sweep runs.
const sweepOverdue = async () => {
  const now = new Date();
  const renotifyBefore = new Date(now.getTime() - OVERDUE_RENOTIFY_MS);

  const tasks = await Task.find({
    status: { $in: ACTIVE_STATUSES },
    due_date: { $lt: now },
    $or: [{ overdue_notified_at: null }, { overdue_notified_at: { $lt: renotifyBefore } }],
  });

  for (const task of tasks) {
    await notifyTaskOverdue({ ministryId: task.ministry_id, task });
    task.overdue_notified_at = now;
    await task.save();
  }
  return tasks.length;
};

const sweepTaskReminders = async () => {
  const dueSoonCount = await sweepDueSoon();
  const overdueCount = await sweepOverdue();
  return { dueSoonCount, overdueCount };
};

module.exports = { sweepTaskReminders, sweepDueSoon, sweepOverdue };
