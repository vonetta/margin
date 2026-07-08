const rateLimit = require("express-rate-limit");

// A test file can legitimately fire more requests in seconds than a real
// client would in the window (re-registering fixture users in every
// beforeEach), so limiters are disabled under NODE_ENV=test — otherwise
// they'd reject requests partway through a run and fail tests for reasons
// unrelated to the behavior under test.
const skip = () => process.env.NODE_ENV === "test";

// General per-IP ceiling on the whole API.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" },
  skip,
});

// Tighter ceiling for endpoints that call a paid AI provider (Claude /
// Gemini) on every hit — flyer generation, background generation, the
// content chat, meeting-transcript extraction, SOP drafting. Applied
// per-handler on those routes so cheap reads on the same resource
// (listing flyers, fetching a draft) aren't throttled, and so a runaway
// client (or a bug) can't run up an unbounded provider bill.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many generation requests, please slow down" },
  skip,
});

module.exports = { generalLimiter, aiLimiter };
