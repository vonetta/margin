// Exact-time scheduling for approved social posts — a timer per post
// fires at its actual scheduled_time, rather than a periodic sweep
// checking "is anything due yet" (which is what the standalone Airtable
// bridge this replaces had to do, since it had no way to react to a
// single record's schedule directly). Running inside Margin's own
// long-lived backend process is what makes exact timers possible here.
const SocialPost = require("../models/SocialPost");
const { publishPost } = require("./socialPostingService");

// Node's setTimeout can't wait longer than ~24.8 days in a single call —
// anything scheduled further out gets a placeholder timer that just
// re-evaluates the real remaining delay when it wakes up, chaining
// forward until the actual fire time is within range.
const MAX_TIMEOUT_MS = 2147483647;

const timers = new Map(); // postId (string) -> Timeout handle

const cancelScheduledPost = (postId) => {
  const key = String(postId);
  const handle = timers.get(key);
  if (handle) {
    clearTimeout(handle);
    timers.delete(key);
  }
};

const firePost = async (postId) => {
  timers.delete(String(postId));
  try {
    const post = await SocialPost.findById(postId);
    // Could have been rejected, deleted, or rescheduled since the timer
    // was set — only actually publish if it's still waiting to go.
    if (!post || post.status !== "approved") return;
    await publishPost(post);
  } catch (error) {
    console.error(`Scheduled social post ${postId} failed to fire:`, error.message);
  }
};

const schedulePost = (post) => {
  cancelScheduledPost(post._id);
  const delay = new Date(post.scheduled_time).getTime() - Date.now();

  if (delay <= 0) {
    // Already due — e.g. approved after its own scheduled time, or the
    // server was down through it. Fire right away rather than lose it
    // silently until the next restart.
    firePost(post._id);
    return;
  }

  if (delay > MAX_TIMEOUT_MS) {
    const handle = setTimeout(() => schedulePost(post), MAX_TIMEOUT_MS);
    timers.set(String(post._id), handle);
    return;
  }

  const handle = setTimeout(() => firePost(post._id), delay);
  timers.set(String(post._id), handle);
};

// Runs once at server startup. In-memory timers don't survive a
// restart/redeploy the way the DB record does, so anything left
// approved-but-not-yet-posted needs its timer re-created from scratch.
const rehydrateScheduledPosts = async () => {
  const pending = await SocialPost.find({
    status: "approved",
    scheduled_time: { $exists: true, $ne: null },
  });
  pending.forEach(schedulePost);
  if (pending.length > 0) {
    console.log(`Rehydrated ${pending.length} scheduled social post(s)`);
  }
};

module.exports = { schedulePost, cancelScheduledPost, rehydrateScheduledPosts };
