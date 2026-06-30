const Notification = require("../models/Notification");
const User = require("../models/User");

const notifyTaskAssigned = async ({ ministryId, task }) => {
  if (task.assigned_to === task.assigned_by) return; // self-assignment, nothing to notify
  await Notification.create({
    ministry_id: ministryId,
    user_id: task.assigned_to,
    type: "task_assigned",
    title: "New task assigned to you",
    body: task.title,
    link: "/tasks",
  });
};

// Every admin/leader of the ministry gets notified — there's no single
// "owner" of the approval queue, so this fans out to all of them rather
// than picking one.
const notifyEventPendingApproval = async ({ ministryId, event }) => {
  const approvers = await User.find({
    "ministries.ministry_id": ministryId,
    "ministries.role": { $in: ["admin", "leader"] },
    is_active: true,
  });

  await Notification.insertMany(
    approvers.map((u) => ({
      ministry_id: ministryId,
      user_id: u._id.toString(),
      type: "event_pending_approval",
      title: "Event needs approval",
      body: event.title,
      link: "/calendar",
    })),
  );
};

module.exports = { notifyTaskAssigned, notifyEventPendingApproval };
