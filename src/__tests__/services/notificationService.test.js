const { connectTestDB } = require("../../testHelpers/db");
const Notification = require("../../models/Notification");
const User = require("../../models/User");
const Ministry = require("../../models/Ministry");
const { notifyTaskAssigned, notifyEventPendingApproval } = require("../../services/notificationService");

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Notification.deleteMany({ ministry_id: "notif-test" });
  await User.deleteMany({ email: { $in: ["notif-admin@ktm.com", "notif-leader@ktm.com", "notif-team@ktm.com"] } });
  await Ministry.deleteMany({ ministry_id: "notif-test" });
});

beforeEach(async () => {
  await Notification.deleteMany({ ministry_id: "notif-test" });
  await User.deleteMany({ email: { $in: ["notif-admin@ktm.com", "notif-leader@ktm.com", "notif-team@ktm.com"] } });
  await Ministry.deleteMany({ ministry_id: "notif-test" });
  await Ministry.create({ ministry_id: "notif-test", name: "Notif Test", plan: "small" });
});

describe("notifyTaskAssigned", () => {
  it("creates a notification for the assignee", async () => {
    const user = await User.create({
      email: "notif-team@ktm.com",
      password: "Password123",
      name: "Team",
      ministries: [{ ministry_id: "notif-test", role: "team" }],
    });

    await notifyTaskAssigned({
      ministryId: "notif-test",
      task: { title: "Confirm setlist", assigned_to: user._id.toString(), assigned_by: "someone-else" },
    });

    const notifications = await Notification.find({ ministry_id: "notif-test" });
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe(user._id.toString());
    expect(notifications[0].type).toBe("task_assigned");
  });

  it("does not notify on self-assignment", async () => {
    await notifyTaskAssigned({
      ministryId: "notif-test",
      task: { title: "My own task", assigned_to: "same-user", assigned_by: "same-user" },
    });

    const notifications = await Notification.find({ ministry_id: "notif-test" });
    expect(notifications.length).toBe(0);
  });
});

describe("notifyEventPendingApproval", () => {
  it("notifies every admin/leader of the ministry, not team members", async () => {
    const admin = await User.create({
      email: "notif-admin@ktm.com",
      password: "Password123",
      name: "Admin",
      ministries: [{ ministry_id: "notif-test", role: "admin" }],
    });
    const leader = await User.create({
      email: "notif-leader@ktm.com",
      password: "Password123",
      name: "Leader",
      ministries: [{ ministry_id: "notif-test", role: "leader" }],
    });
    await User.create({
      email: "notif-team@ktm.com",
      password: "Password123",
      name: "Team",
      ministries: [{ ministry_id: "notif-test", role: "team" }],
    });

    await notifyEventPendingApproval({
      ministryId: "notif-test",
      event: { title: "Worship Intensive" },
    });

    const notifications = await Notification.find({ ministry_id: "notif-test" });
    expect(notifications.length).toBe(2);
    const recipientIds = notifications.map((n) => n.user_id).sort();
    expect(recipientIds).toEqual([admin._id.toString(), leader._id.toString()].sort());
  });
});
