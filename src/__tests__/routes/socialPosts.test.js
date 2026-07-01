const mockSchedulePost = jest.fn();
const mockCancelScheduledPost = jest.fn();
jest.mock("../../services/socialPostScheduler", () => ({
  schedulePost: (...args) => mockSchedulePost(...args),
  cancelScheduledPost: (...args) => mockCancelScheduledPost(...args),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const User = require("../../models/User");
const SocialAccount = require("../../models/SocialAccount");
const SocialPost = require("../../models/SocialPost");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

let adminToken, teamToken, fbAccountId, igAccountId;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await SocialAccount.deleteMany({ ministry_id: "ktm-test" });
  await SocialPost.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: { $in: ["sp-admin@ktm.com", "sp-team@ktm.com"] } });
});

beforeEach(async () => {
  jest.clearAllMocks();
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await SocialAccount.deleteMany({ ministry_id: "ktm-test" });
  await SocialPost.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: { $in: ["sp-admin@ktm.com", "sp-team@ktm.com"] } });
  await Ministry.create(testMinistry);

  const a = await request(app).post("/api/auth/register").send({
    email: "sp-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = a.body.token;

  const t = await request(app).post("/api/auth/register").send({
    email: "sp-team@ktm.com",
    password: "Password123",
    name: "Team",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = t.body.token;

  const fbAccount = await SocialAccount.create({
    ministry_id: "ktm-test",
    platform_page_id: "page-1",
    page_name: "KTM Page",
    page_access_token: "encrypted-placeholder",
    connected_by: "someone",
  });
  fbAccountId = fbAccount._id.toString();

  const igAccount = await SocialAccount.create({
    ministry_id: "ktm-test",
    platform_page_id: "page-2",
    page_name: "KTM IG Linked Page",
    page_access_token: "encrypted-placeholder",
    instagram_business_account_id: "ig-1",
    instagram_username: "ktm_ministries",
    connected_by: "someone",
  });
  igAccountId = igAccount._id.toString();
});

describe("POST /api/social-posts", () => {
  it("creates a post in pending_approval status", async () => {
    const res = await request(app)
      .post("/api/social-posts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        caption: "Join us Sunday!",
        graphic_urls: ["https://example.com/flyer.png"],
        post_type: "image",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending_approval");
  });

  it("rejects a team member from creating a post", async () => {
    const res = await request(app)
      .post("/api/social-posts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ caption: "x", graphic_urls: ["https://example.com/a.png"], post_type: "image" });
    expect(res.status).toBe(403);
  });

  it("requires at least one graphic URL", async () => {
    const res = await request(app)
      .post("/api/social-posts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ caption: "x", graphic_urls: [], post_type: "image" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/social-posts/:id/approve", () => {
  it("sets targets and scheduled_time, and hands the post to the scheduler", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "Join us Sunday!",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      created_by: "someone",
    });

    const scheduledTime = new Date(Date.now() + 3600000).toISOString();
    const res = await request(app)
      .put(`/api/social-posts/${post._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        targets: [{ social_account_id: fbAccountId, platform: "facebook" }],
        scheduled_time: scheduledTime,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(mockSchedulePost).toHaveBeenCalledTimes(1);
  });

  it("rejects approving with an instagram target on an account with no linked Instagram", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "Join us Sunday!",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      created_by: "someone",
    });

    const res = await request(app)
      .put(`/api/social-posts/${post._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        targets: [{ social_account_id: fbAccountId, platform: "instagram" }],
        scheduled_time: new Date(Date.now() + 3600000).toISOString(),
      });

    expect(res.status).toBe(400);
    expect(mockSchedulePost).not.toHaveBeenCalled();
  });

  it("accepts an instagram target when the account actually has one linked", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "Join us Sunday!",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      created_by: "someone",
    });

    const res = await request(app)
      .put(`/api/social-posts/${post._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        targets: [{ social_account_id: igAccountId, platform: "instagram" }],
        scheduled_time: new Date(Date.now() + 3600000).toISOString(),
      });

    expect(res.status).toBe(200);
  });

  it("rejects a target account that doesn't belong to this ministry", async () => {
    const otherAccount = await SocialAccount.create({
      ministry_id: "some-other-ministry",
      platform_page_id: "page-x",
      page_name: "Other",
      page_access_token: "x",
      connected_by: "someone",
    });
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "x",
      graphic_urls: ["https://example.com/a.png"],
      post_type: "image",
      created_by: "someone",
    });

    const res = await request(app)
      .put(`/api/social-posts/${post._id}/approve`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        targets: [{ social_account_id: otherAccount._id.toString(), platform: "facebook" }],
        scheduled_time: new Date(Date.now() + 3600000).toISOString(),
      });
    expect(res.status).toBe(400);
    await SocialAccount.deleteOne({ _id: otherAccount._id });
  });
});

describe("PUT /api/social-posts/:id/reject", () => {
  it("rejects a post and cancels any scheduled timer", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "x",
      graphic_urls: ["https://example.com/a.png"],
      post_type: "image",
      status: "approved",
      created_by: "someone",
      scheduled_time: new Date(Date.now() + 3600000),
      targets: [{ social_account_id: fbAccountId, platform: "facebook" }],
    });

    const res = await request(app)
      .put(`/api/social-posts/${post._id}/reject`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(mockCancelScheduledPost.mock.calls[0][0].toString()).toBe(post._id.toString());
  });
});

describe("PUT /api/social-posts/:id", () => {
  it("rejects editing a post that's already posted", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "x",
      graphic_urls: ["https://example.com/a.png"],
      post_type: "image",
      status: "posted",
      created_by: "someone",
    });

    const res = await request(app)
      .put(`/api/social-posts/${post._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ caption: "edited" });
    expect(res.status).toBe(400);
  });

  it("reschedules the timer when an approved post's scheduled_time changes", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "x",
      graphic_urls: ["https://example.com/a.png"],
      post_type: "image",
      status: "approved",
      created_by: "someone",
      scheduled_time: new Date(Date.now() + 3600000),
      targets: [{ social_account_id: fbAccountId, platform: "facebook" }],
    });

    const res = await request(app)
      .put(`/api/social-posts/${post._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scheduled_time: new Date(Date.now() + 7200000).toISOString() });

    expect(res.status).toBe(200);
    expect(mockSchedulePost).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/social-posts/:id", () => {
  it("deletes a post and cancels its timer", async () => {
    const post = await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "x",
      graphic_urls: ["https://example.com/a.png"],
      post_type: "image",
      created_by: "someone",
    });

    const res = await request(app)
      .delete(`/api/social-posts/${post._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(mockCancelScheduledPost.mock.calls[0][0].toString()).toBe(post._id.toString());
    const remaining = await SocialPost.findById(post._id);
    expect(remaining).toBeNull();
  });
});

describe("GET /api/social-posts", () => {
  it("filters by status", async () => {
    await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "a",
      graphic_urls: ["https://example.com/a.png"],
      post_type: "image",
      status: "pending_approval",
      created_by: "someone",
    });
    await SocialPost.create({
      ministry_id: "ktm-test",
      caption: "b",
      graphic_urls: ["https://example.com/b.png"],
      post_type: "image",
      status: "posted",
      created_by: "someone",
    });

    const res = await request(app)
      .get("/api/social-posts?status=pending_approval")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.length).toBe(1);
    expect(res.body[0].caption).toBe("a");
  });
});
