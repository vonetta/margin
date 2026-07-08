const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const tenantMiddleware = require("./middleware/tenant");
const { authMiddleware, requireOnboarding } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const ministryRoutes = require("./routes/ministry");
const aiProfileRoutes = require("./routes/aiProfile");
const contentRoutes = require("./routes/content");
const peopleRoutes = require("./routes/people");
const backgroundRoutes = require("./routes/backgrounds");
const flyerRoutes = require("./routes/flyers");
const communicationsRoutes = require("./routes/communications");
const eventRoutes = require("./routes/events");
const publicCalendarRoutes = require("./routes/publicCalendar");
const taskRoutes = require("./routes/tasks");
const meetingRoutes = require("./routes/meetings");
const notificationRoutes = require("./routes/notifications");
const inviteRoutes = require("./routes/invites");
const publicInviteRoutes = require("./routes/publicInvites");
const socialAuthRoutes = require("./routes/socialAuth");
const publicSocialCallbackRoutes = require("./routes/publicSocialCallback");
const socialPostRoutes = require("./routes/socialPosts");
const { rehydrateScheduledPosts } = require("./services/socialPostScheduler");
const { checkMongo, checkAi } = require("./services/healthService");
dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

// Error tracking activates only when a DSN is configured — until then
// every Sentry call below is a no-op, so local/test runs need nothing.
const Sentry = require("@sentry/node");
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
  });
}

connectDB().then(() => {
  // In-memory timers don't exist until now — nothing to rehydrate during
  // tests, and doing it there risks a test's mocked SocialAccount/fetch
  // setup interacting with a timer that outlives that specific test.
  if (process.env.NODE_ENV !== "test") {
    rehydrateScheduledPosts();
  }
});

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
// Defaults to reflecting any origin (current behavior) until CORS_ORIGIN is
// set in the environment — set it to the frontend's domain(s) once deployed
// (comma-separated for multiple) to stop arbitrary sites from calling this
// API from a victim's browser using a token pulled from their JS context.
app.use(
  cors(
    process.env.CORS_ORIGIN
      ? { origin: process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) }
      : {},
  ),
);
app.use(express.json({ limit: "10kb" }));

// Real request patterns don't apply in tests — a single test file can
// legitimately fire more requests in seconds than a real client would in
// 15 minutes (e.g. re-registering fixture users in every test's
// beforeEach), so the limiter would otherwise start rejecting requests
// partway through a run and produce failures that have nothing to do
// with the behavior under test.
const skip = () => process.env.NODE_ENV === "test";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" },
  skip,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many generation requests, please slow down" },
  skip,
});

app.use("/api", limiter);
app.use("/api/content/generate", aiLimiter);

// Railway's deploy healthcheck points here, so this must reflect only
// what should block a deploy: the process is up and Mongo is reachable.
// AI-provider problems (e.g. an empty Anthropic credit balance) are a
// degradation, not a reason to fail deploys of the whole API — those
// surface on /health/deep instead.
app.get("/health", (req, res) => {
  const mongoOk = checkMongo();
  res
    .status(mongoOk ? 200 : 503)
    .json({ status: mongoOk ? "ok" : "degraded", mongo: mongoOk ? "ok" : "down" });
});

// The endpoint an uptime monitor should watch: Mongo plus a cached
// 1-token Anthropic canary (the only check that catches a valid key
// with no credit — the outage that actually happened). Returns 503 on
// any failure so a dumb HTTP monitor alerts without parsing the body.
app.get("/health/deep", async (req, res) => {
  const mongoOk = checkMongo();
  const ai = await checkAi();
  const ok = mongoOk && ai.ok === true;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    mongo: mongoOk ? "ok" : "down",
    ai,
  });
});

// Auth routes — public, no tenant or auth middleware
app.use("/api/auth", authRoutes);

// Public calendar feed — no auth, no tenant middleware. The ministry is
// identified by the URL itself (/:ministry_id.ics), the way a WordPress
// calendar plugin or any external calendar app subscribes to it.
app.use("/api/public/calendar", publicCalendarRoutes);

// Public invite lookup — no auth, no tenant middleware. Lets the join
// page show who/where/what-role before the invitee has an account.
app.use("/api/public/invites", publicInviteRoutes);

// Meta's OAuth redirect — a raw browser navigation with no Authorization
// header, so this has to be public. Mounted at the exact /callback path
// before the tenant-guarded /api/social/* routes below, so it's matched
// first and never hits the auth middleware.
app.use("/api/social/callback", publicSocialCallbackRoutes);

// All routes below require tenant and auth middleware
app.use("/api", tenantMiddleware);
app.use("/api", authMiddleware);

// Profile-dependent surfaces (need a real AI profile to produce anything
// useful) — gated behind onboarding on the backend too, mirroring the
// frontend's ProtectedRoute requireOnboarding boundary so a direct API
// call can't bypass what the UI enforces.
app.use("/api/flyers", requireOnboarding, flyerRoutes);
app.use("/api/content", requireOnboarding, contentRoutes);
app.use("/api/social-posts", requireOnboarding, socialPostRoutes);

app.use("/api/backgrounds", backgroundRoutes);
app.use("/api/ministry", ministryRoutes);
app.use("/api/profile", aiProfileRoutes);
app.use("/api/people", peopleRoutes);
app.use("/api/communications", communicationsRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/social", socialAuthRoutes);

app.get("/api/test", (req, res) => {
  res.json({ ministry: req.ministryId });
});

app.use((err, req, res, next) => {
  // No-op unless SENTRY_DSN is configured (see init at the top).
  Sentry.captureException(err);
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
