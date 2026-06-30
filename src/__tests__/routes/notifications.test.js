const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Notification = require("../../models/Notification");
const User = require("../../models/User");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

let token, userId;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Notification.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "notif-route@ktm.com" });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Notification.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: "notif-route@ktm.com" });
  await Ministry.create(testMinistry);

  const res = await request(app).post("/api/auth/register").send({
    email: "notif-route@ktm.com",
    password: "Password123",
    name: "User",
    ministry_id: "ktm-test",
    role: "admin",
  });
  token = res.body.token;
  userId = res.body.user.id;
});

describe("GET /api/notifications", () => {
  it("returns only this user's notifications", async () => {
    await Notification.create({
      ministry_id: "ktm-test",
      user_id: userId,
      type: "task_assigned",
      title: "New task assigned to you",
      body: "Confirm setlist",
    });
    await Notification.create({
      ministry_id: "ktm-test",
      user_id: "someone-else",
      type: "task_assigned",
      title: "Not for you",
    });

    const res = await request(app)
      .get("/api/notifications")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe("New task assigned to you");
  });

  it("filters to unread only with unread=true", async () => {
    await Notification.create({
      ministry_id: "ktm-test",
      user_id: userId,
      type: "task_assigned",
      title: "Unread",
      read: false,
    });
    await Notification.create({
      ministry_id: "ktm-test",
      user_id: userId,
      type: "task_assigned",
      title: "Already read",
      read: true,
    });

    const res = await request(app)
      .get("/api/notifications?unread=true")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe("Unread");
  });
});

describe("PUT /api/notifications/:id/read", () => {
  it("marks a notification read", async () => {
    const n = await Notification.create({
      ministry_id: "ktm-test",
      user_id: userId,
      type: "task_assigned",
      title: "Mark me read",
    });

    const res = await request(app)
      .put(`/api/notifications/${n._id}/read`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
  });
});

describe("PUT /api/notifications/read-all", () => {
  it("marks every unread notification for this user as read", async () => {
    await Notification.create({ ministry_id: "ktm-test", user_id: userId, type: "task_assigned", title: "A" });
    await Notification.create({ ministry_id: "ktm-test", user_id: userId, type: "task_assigned", title: "B" });

    const res = await request(app)
      .put("/api/notifications/read-all")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const remaining = await Notification.find({ ministry_id: "ktm-test", read: false });
    expect(remaining.length).toBe(0);
  });
});
