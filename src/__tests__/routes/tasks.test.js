const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const { registerMember } = require("../../testHelpers/register");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Task = require("../../models/Task");
const User = require("../../models/User");
const Notification = require("../../models/Notification");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

let adminToken, adminId, teamAToken, teamAId, teamBToken, teamBId, outsiderToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: { $in: ["ktm-test", "other-ministry-test"] } });
  await Task.deleteMany({ ministry_id: "ktm-test" });
  await Notification.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: {
      $in: [
        "tasks-admin@ktm.com",
        "tasks-teamA@ktm.com",
        "tasks-teamB@ktm.com",
        "tasks-outsider@other.com",
      ],
    },
  });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: { $in: ["ktm-test", "other-ministry-test"] } });
  await Task.deleteMany({ ministry_id: "ktm-test" });
  await Notification.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: {
      $in: [
        "tasks-admin@ktm.com",
        "tasks-teamA@ktm.com",
        "tasks-teamB@ktm.com",
        "tasks-outsider@other.com",
      ],
    },
  });
  await Ministry.create(testMinistry);
  await Ministry.create({ ministry_id: "other-ministry-test", name: "Other Ministry", plan: "small" });

  const a = await request(app).post("/api/auth/register").send({
    email: "tasks-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = a.body.token;
  adminId = a.body.user.id;

  const tA = await registerMember(app, {
    ministry_id: "ktm-test",
    email: "tasks-teamA@ktm.com",
    password: "Password123",
    name: "Team A",
    role: "team",
  });
  teamAToken = tA.body.token;
  teamAId = tA.body.user.id;

  const tB = await registerMember(app, {
    ministry_id: "ktm-test",
    email: "tasks-teamB@ktm.com",
    password: "Password123",
    name: "Team B",
    role: "team",
  });
  teamBToken = tB.body.token;
  teamBId = tB.body.user.id;

  const outsider = await request(app).post("/api/auth/register").send({
    email: "tasks-outsider@other.com",
    password: "Password123",
    name: "Outsider",
    ministry_id: "other-ministry-test",
    role: "admin",
  });
  outsiderToken = outsider.body.token;
});

describe("POST /api/tasks", () => {
  it("lets a non-admin team member create and assign a task to a teammate", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`)
      .send({ title: "Confirm worship setlist", assigned_to: teamAId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
  });

  it("rejects assigning a task to someone outside this ministry", async () => {
    const outsiderRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${outsiderToken}`);
    const outsiderId = outsiderRes.body._id;

    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Should fail", assigned_to: outsiderId });
    expect(res.status).toBe(400);
  });

  it("creates a notification for the assignee", async () => {
    await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Confirm worship setlist", assigned_to: teamAId });

    const notifications = await Notification.find({ ministry_id: "ktm-test", user_id: teamAId });
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe("task_assigned");
  });

  it("requires a title", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`)
      .send({ assigned_to: teamAId });
    expect(res.status).toBe(400);
  });

  it("creates a recurring task with a valid RRULE and a due_date anchor", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`)
      .send({
        title: "Submit the bulletin",
        assigned_to: teamAId,
        due_date: "2026-06-02T18:00:00Z",
        recurrence_rule: "FREQ=WEEKLY",
      });
    expect(res.status).toBe(201);
    expect(res.body.recurrence_rule).toBe("FREQ=WEEKLY");
  });

  it("rejects a recurring task with no due_date to anchor it", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`)
      .send({ title: "Submit the bulletin", assigned_to: teamAId, recurrence_rule: "FREQ=WEEKLY" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid recurrence rule", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`)
      .send({
        title: "Submit the bulletin",
        assigned_to: teamAId,
        due_date: "2026-06-02T18:00:00Z",
        recurrence_rule: "NOT VALID @@@",
      });
    expect(res.status).toBe(400);
  });

  it("creates one document per person, sharing a group_id, when assigned_to is an array", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Set up the check-in table", assigned_to: [teamAId, teamBId] });

    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.group_id).toBeTruthy();
    expect(res.body.tasks[0].group_id).toBe(res.body.group_id);
    expect(res.body.tasks[1].group_id).toBe(res.body.group_id);
    expect(new Set(res.body.tasks.map((t) => t.assigned_to))).toEqual(new Set([teamAId, teamBId]));

    const notifications = await Notification.find({
      ministry_id: "ktm-test",
      user_id: { $in: [teamAId, teamBId] },
      type: "task_assigned",
    });
    expect(notifications.length).toBe(2);
  });

  it("a single-element array behaves exactly like a plain string (no group_id)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Solo task", assigned_to: [teamAId] });

    expect(res.status).toBe(201);
    expect(res.body.group_id).toBeNull();
    expect(res.body.tasks).toBeUndefined();
    expect(res.body.assigned_to).toBe(teamAId);
  });

  it("rejects a shared task if any one of the assignees is outside this ministry", async () => {
    const outsiderRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${outsiderToken}`);
    const outsiderId = outsiderRes.body._id;

    const res = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Should fail", assigned_to: [teamAId, outsiderId] });

    expect(res.status).toBe(400);
    const created = await Task.find({ ministry_id: "ktm-test", title: "Should fail" });
    expect(created).toHaveLength(0);
  });
});

describe("GET /api/tasks", () => {
  it("defaults to tasks assigned to the caller", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "For Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
    });
    await Task.create({
      ministry_id: "ktm-test",
      title: "For Admin",
      assigned_to: adminId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .get("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe("For Team A");
  });

  it("returns tasks the caller assigned to others with mine=false", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Assigned by admin",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .get("/api/tasks?mine=false")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe("Assigned by admin");
  });

  it("attaches co-assignee (sibling) info to a shared task, so it's visible outside the admin-only board", async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Shared setup", assigned_to: [teamAId, teamBId] });
    expect(createRes.status).toBe(201);

    const res = await request(app)
      .get("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);

    expect(res.body.length).toBe(1);
    expect(res.body[0].siblings).toHaveLength(1);
    expect(res.body[0].siblings[0].name).toBe("Team B");
    expect(res.body[0].siblings[0].status).toBe("open");
    // Never includes the caller's own row as a "sibling" of itself.
    expect(res.body[0].siblings.every((s) => s.user_id !== teamAId)).toBe(true);
  });

  it("does not attach a siblings field at all to an ordinary single-assignee task", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Solo task",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .get("/api/tasks")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);

    expect(res.body[0].siblings).toBeUndefined();
  });
});

describe("GET /api/tasks/similar", () => {
  it("flags an exact-ish match (case/punctuation-insensitive)", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Rent the van",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .get("/api/tasks/similar")
      .query({ title: "rent a van!" })
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Rent the van");
    expect(res.body[0].assignee_name).toBe("Team A");
  });

  it("does not flag genuinely different titles", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Rent the van",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .get("/api/tasks/similar")
      .query({ title: "Submit the bulletin" })
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);

    expect(res.body).toHaveLength(0);
  });

  it("ignores done tasks — only open/on_hold count as an active duplicate", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Rent the van",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "done",
    });

    const res = await request(app)
      .get("/api/tasks/similar")
      .query({ title: "Rent the van" })
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);

    expect(res.body).toHaveLength(0);
  });

  it("flags an on_hold task too", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Rent the van",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "on_hold",
    });

    const res = await request(app)
      .get("/api/tasks/similar")
      .query({ title: "Rent the van" })
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);

    expect(res.body).toHaveLength(1);
  });

  it("is scoped to the current ministry", async () => {
    await Ministry.create({ ministry_id: "similar-other-test", name: "Other", plan: "small" });
    await Task.create({
      ministry_id: "similar-other-test",
      title: "Rent the van",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .get("/api/tasks/similar")
      .query({ title: "Rent the van" })
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);

    expect(res.body).toHaveLength(0);
    await Ministry.deleteOne({ ministry_id: "similar-other-test" });
    await Task.deleteMany({ ministry_id: "similar-other-test" });
  });
});

describe("GET /api/tasks/team-overview", () => {
  it("groups open tasks by assignee for an admin, defaulting to status=active (open+on_hold)", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Open for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "open",
    });
    await Task.create({
      ministry_id: "ktm-test",
      title: "On hold for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "on_hold",
    });
    await Task.create({
      ministry_id: "ktm-test",
      title: "Done for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "done",
    });

    const res = await request(app)
      .get("/api/tasks/team-overview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body[teamAId].name).toBe("Team A");
    expect(res.body[teamAId].tasks).toHaveLength(2);
    expect(res.body[teamAId].tasks.map((t) => t.title).sort()).toEqual([
      "On hold for Team A",
      "Open for Team A",
    ]);
  });

  it("returns only done tasks with status=done", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Open for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "open",
    });
    await Task.create({
      ministry_id: "ktm-test",
      title: "Done for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "done",
    });

    const res = await request(app)
      .get("/api/tasks/team-overview?status=done")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body[teamAId].tasks).toHaveLength(1);
    expect(res.body[teamAId].tasks[0].title).toBe("Done for Team A");
  });

  it("returns both open and done tasks with status=all", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Open for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "open",
    });
    await Task.create({
      ministry_id: "ktm-test",
      title: "Done for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "done",
    });

    const res = await request(app)
      .get("/api/tasks/team-overview?status=all")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body[teamAId].tasks).toHaveLength(2);
  });

  it("returns only on-hold tasks with status=on_hold", async () => {
    await Task.create({
      ministry_id: "ktm-test",
      title: "Open for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "open",
    });
    await Task.create({
      ministry_id: "ktm-test",
      title: "Blocked for Team A",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "on_hold",
      hold_reason: "Waiting on vendor",
    });

    const res = await request(app)
      .get("/api/tasks/team-overview?status=on_hold")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body[teamAId].tasks).toHaveLength(1);
    expect(res.body[teamAId].tasks[0].title).toBe("Blocked for Team A");
    expect(res.body[teamAId].tasks[0].hold_reason).toBe("Waiting on vendor");
  });

  it("is blocked for a plain team member", async () => {
    const res = await request(app)
      .get("/api/tasks/team-overview")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/tasks/:id/complete and /reopen", () => {
  it("lets the assignee mark their own task complete", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Do the thing",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/complete`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
  });

  it("rolls a recurring task forward to its next due date when completed", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Submit the bulletin",
      assigned_to: teamAId,
      assigned_by: adminId,
      due_date: new Date("2026-06-02T18:00:00Z"),
      recurrence_rule: "FREQ=WEEKLY",
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/complete`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
    expect(res.body.next_task).toBeTruthy();
    expect(res.body.next_task.status).toBe("open");
    expect(new Date(res.body.next_task.due_date).toISOString()).toBe("2026-06-09T18:00:00.000Z");

    const allTasks = await Task.find({ ministry_id: "ktm-test", title: "Submit the bulletin" });
    expect(allTasks.length).toBe(2);
  });

  it("does not roll forward a one-off (non-recurring) task", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "One-off",
      assigned_to: teamAId,
      assigned_by: adminId,
      due_date: new Date("2026-06-02T18:00:00Z"),
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/complete`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);
    expect(res.body.next_task).toBeNull();
  });

  it("rejects a teammate who is neither the assignee, assigner, nor admin/leader", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Do the thing",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/complete`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);
    expect(res.status).toBe(403);
  });

  it("lets an admin reopen a completed task even if they didn't create it", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Do the thing",
      assigned_to: teamAId,
      assigned_by: teamAId,
      status: "done",
      completed_at: new Date(),
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/reopen`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");
  });
});

describe("PUT /api/tasks/:id/hold", () => {
  it("puts a task on hold with an optional reason", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Waiting on the vendor",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/hold`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`)
      .send({ reason: "Waiting on Franco to confirm the venue" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("on_hold");
    expect(res.body.hold_reason).toBe("Waiting on Franco to confirm the venue");
  });

  it("clears hold_reason and completed_at when reopened from hold", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Waiting on the vendor",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "on_hold",
      hold_reason: "Blocked",
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/reopen`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");
    expect(res.body.hold_reason).toBeUndefined();
  });

  it("rejects a teammate who isn't the assignee, assigner, or admin/leader", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Waiting on the vendor",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}/hold`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/tasks/:id/assignees", () => {
  it("adds a co-assignee as a new sibling document sharing a group_id", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Set up the check-in table",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .post(`/api/tasks/${task._id}/assignees`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_id: teamBId });

    expect(res.status).toBe(201);
    expect(res.body.assigned_to).toBe(teamBId);
    expect(res.body.title).toBe("Set up the check-in table");
    expect(res.body.group_id).toBeTruthy();

    const original = await Task.findById(task._id);
    expect(original.group_id).toBe(res.body.group_id);

    const notification = await Notification.findOne({ ministry_id: "ktm-test", user_id: teamBId });
    expect(notification).toBeTruthy();
  });

  it("does not touch the original document's own assignment", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Set up the check-in table",
      assigned_to: teamAId,
      assigned_by: adminId,
      status: "done",
      completed_at: new Date(),
    });

    await request(app)
      .post(`/api/tasks/${task._id}/assignees`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_id: teamBId });

    const original = await Task.findById(task._id);
    expect(original.status).toBe("done");
    expect(original.assigned_to).toBe(teamAId);
  });

  it("rejects adding someone outside this ministry", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Set up the check-in table",
      assigned_to: teamAId,
      assigned_by: adminId,
    });
    const outsiderRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${outsiderToken}`);

    const res = await request(app)
      .post(`/api/tasks/${task._id}/assignees`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_id: outsiderRes.body._id });

    expect(res.status).toBe(400);
  });

  it("rejects adding someone who's already assigned", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Set up the check-in table",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .post(`/api/tasks/${task._id}/assignees`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ user_id: teamAId });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("lets the assigner delete a task they created", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Cancel this",
      assigned_to: teamAId,
      assigned_by: adminId,
    });

    const res = await request(app)
      .delete(`/api/tasks/${task._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("rejects an unrelated team member deleting someone else's task", async () => {
    const task = await Task.create({
      ministry_id: "ktm-test",
      title: "Not yours",
      assigned_to: teamAId,
      assigned_by: teamAId,
    });

    const res = await request(app)
      .delete(`/api/tasks/${task._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamBToken}`);
    expect(res.status).toBe(403);
  });
});
