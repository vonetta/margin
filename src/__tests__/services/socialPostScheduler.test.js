const mockPublishPost = jest.fn();
jest.mock("../../services/socialPostingService", () => ({
  publishPost: (...args) => mockPublishPost(...args),
}));

const { connectTestDB } = require("../../testHelpers/db");
const Ministry = require("../../models/Ministry");
const SocialPost = require("../../models/SocialPost");
const {
  schedulePost,
  cancelScheduledPost,
  rehydrateScheduledPosts,
} = require("../../services/socialPostScheduler");

// Real timers, not jest fake timers — mongoose/the MongoDB driver rely on
// real setTimeout internally for connection/socket management, so faking
// all timers globally hangs every DB call in these tests. Short
// millisecond delays keep this fast without that conflict.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await connectTestDB();
  await Ministry.create({ ministry_id: "scheduler-test", name: "Scheduler Test", plan: "enterprise" });
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "scheduler-test" });
  await SocialPost.deleteMany({ ministry_id: "scheduler-test" });
});

beforeEach(async () => {
  mockPublishPost.mockReset();
  mockPublishPost.mockResolvedValue([]);
  await SocialPost.deleteMany({ ministry_id: "scheduler-test" });
});

const makePost = (overrides = {}) =>
  SocialPost.create({
    ministry_id: "scheduler-test",
    caption: "Test caption",
    graphic_urls: ["https://example.com/a.png"],
    post_type: "image",
    created_by: "user1",
    status: "approved",
    scheduled_time: new Date(Date.now() + 200),
    targets: [{ social_account_id: "acct1", platform: "facebook" }],
    ...overrides,
  });

describe("schedulePost", () => {
  it("fires publishPost at roughly the scheduled delay, not before", async () => {
    const post = await makePost({ scheduled_time: new Date(Date.now() + 200) });
    schedulePost(post);

    await wait(80);
    expect(mockPublishPost).not.toHaveBeenCalled();

    await wait(250);
    expect(mockPublishPost).toHaveBeenCalledTimes(1);
  }, 10000);

  it("fires immediately for a post whose scheduled time has already passed", async () => {
    const post = await makePost({ scheduled_time: new Date(Date.now() - 60000) });
    schedulePost(post);
    await wait(50);
    expect(mockPublishPost).toHaveBeenCalledTimes(1);
  }, 10000);

  it("re-fetches the post before firing, and skips it if it's no longer approved", async () => {
    const post = await makePost({ scheduled_time: new Date(Date.now() + 150) });
    schedulePost(post);

    // Rejected after being scheduled, before the timer fires.
    await SocialPost.findByIdAndUpdate(post._id, { status: "rejected" });

    await wait(300);
    expect(mockPublishPost).not.toHaveBeenCalled();
  }, 10000);
});

describe("cancelScheduledPost", () => {
  it("prevents a previously scheduled post from firing", async () => {
    const post = await makePost({ scheduled_time: new Date(Date.now() + 150) });
    schedulePost(post);
    cancelScheduledPost(post._id);

    await wait(300);
    expect(mockPublishPost).not.toHaveBeenCalled();
  }, 10000);

  it("rescheduling the same post cancels the old timer instead of firing twice", async () => {
    const post = await makePost({ scheduled_time: new Date(Date.now() + 100) });
    schedulePost(post);

    post.scheduled_time = new Date(Date.now() + 400);
    schedulePost(post);

    await wait(200);
    expect(mockPublishPost).not.toHaveBeenCalled();

    await wait(350);
    expect(mockPublishPost).toHaveBeenCalledTimes(1);
  }, 10000);
});

describe("rehydrateScheduledPosts", () => {
  it("re-schedules every approved post with a future scheduled_time", async () => {
    await makePost({ scheduled_time: new Date(Date.now() + 200) });
    await makePost({ scheduled_time: new Date(Date.now() + 200) });
    await makePost({ status: "posted", scheduled_time: new Date(Date.now() + 200) });
    await makePost({ status: "pending_approval", scheduled_time: undefined });

    await rehydrateScheduledPosts();

    await wait(350);
    // Only the 2 approved-with-a-schedule posts should have fired.
    expect(mockPublishPost).toHaveBeenCalledTimes(2);
  }, 10000);
});
