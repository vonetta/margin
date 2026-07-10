const { connectTestDB } = require("../../testHelpers/db");
const Task = require("../../models/Task");
const Notification = require("../../models/Notification");
const Ministry = require("../../models/Ministry");
const { sweepTaskReminders } = require("../../services/taskReminderService");

const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Task.deleteMany({ ministry_id: "reminder-test" });
  await Notification.deleteMany({ ministry_id: "reminder-test" });
  await Ministry.deleteMany({ ministry_id: "reminder-test" });
});

beforeEach(async () => {
  await Task.deleteMany({ ministry_id: "reminder-test" });
  await Notification.deleteMany({ ministry_id: "reminder-test" });
  await Ministry.deleteMany({ ministry_id: "reminder-test" });
  await Ministry.create({ ministry_id: "reminder-test", name: "Reminder Test", plan: "small" });
});

describe("sweepTaskReminders", () => {
  it("notifies a task due within 24h and stamps due_soon_notified_at", async () => {
    const task = await Task.create({
      ministry_id: "reminder-test",
      title: "Due soon task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      due_date: new Date(Date.now() + 6 * HOUR),
    });

    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_due_soon" });
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe("user-a");

    const updated = await Task.findById(task._id);
    expect(updated.due_soon_notified_at).not.toBeNull();
  });

  it("does not re-notify due-soon on a second sweep", async () => {
    await Task.create({
      ministry_id: "reminder-test",
      title: "Due soon task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      due_date: new Date(Date.now() + 6 * HOUR),
    });

    await sweepTaskReminders();
    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_due_soon" });
    expect(notifications.length).toBe(1);
  });

  it("does not notify a task due more than 24h out", async () => {
    await Task.create({
      ministry_id: "reminder-test",
      title: "Not due soon",
      assigned_to: "user-a",
      assigned_by: "user-b",
      due_date: new Date(Date.now() + 3 * 24 * HOUR),
    });

    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_due_soon" });
    expect(notifications.length).toBe(0);
  });

  it("notifies an overdue task and stamps overdue_notified_at", async () => {
    const task = await Task.create({
      ministry_id: "reminder-test",
      title: "Overdue task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      due_date: new Date(Date.now() - 2 * HOUR),
    });

    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_overdue" });
    expect(notifications.length).toBe(1);

    const updated = await Task.findById(task._id);
    expect(updated.overdue_notified_at).not.toBeNull();
  });

  it("does not re-notify overdue within 24h, but does after", async () => {
    const task = await Task.create({
      ministry_id: "reminder-test",
      title: "Overdue task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      due_date: new Date(Date.now() - 2 * HOUR),
      overdue_notified_at: new Date(Date.now() - 1 * HOUR),
    });

    await sweepTaskReminders();
    let notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_overdue" });
    expect(notifications.length).toBe(0);

    await Task.findByIdAndUpdate(task._id, { overdue_notified_at: new Date(Date.now() - 25 * HOUR) });
    await sweepTaskReminders();
    notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_overdue" });
    expect(notifications.length).toBe(1);
  });

  it("does not notify done tasks", async () => {
    await Task.create({
      ministry_id: "reminder-test",
      title: "Done task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      status: "done",
      due_date: new Date(Date.now() - 2 * HOUR),
    });

    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test" });
    expect(notifications.length).toBe(0);
  });

  it("notifies on_hold tasks the same as open ones", async () => {
    await Task.create({
      ministry_id: "reminder-test",
      title: "Held task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      status: "on_hold",
      due_date: new Date(Date.now() - 2 * HOUR),
    });

    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_overdue" });
    expect(notifications.length).toBe(1);
  });

  it("notifies siblings of a shared (group_id) task independently", async () => {
    await Task.create({
      ministry_id: "reminder-test",
      title: "Shared task",
      assigned_to: "user-a",
      assigned_by: "user-b",
      group_id: "group-1",
      due_date: new Date(Date.now() - 2 * HOUR),
    });
    await Task.create({
      ministry_id: "reminder-test",
      title: "Shared task",
      assigned_to: "user-c",
      assigned_by: "user-b",
      group_id: "group-1",
      due_date: new Date(Date.now() - 2 * HOUR),
    });

    await sweepTaskReminders();

    const notifications = await Notification.find({ ministry_id: "reminder-test", type: "task_overdue" });
    expect(notifications.length).toBe(2);
    const recipientIds = notifications.map((n) => n.user_id).sort();
    expect(recipientIds).toEqual(["user-a", "user-c"].sort());
  });
});
