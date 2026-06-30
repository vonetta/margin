const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const tenantMiddleware = require("./middleware/tenant");
const { authMiddleware } = require("./middleware/auth");
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
dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

connectDB();

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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many generation requests, please slow down" },
});

app.use("/api", limiter);
app.use("/api/content/generate", aiLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Margin API running" });
});

// Auth routes — public, no tenant or auth middleware
app.use("/api/auth", authRoutes);

// Public calendar feed — no auth, no tenant middleware. The ministry is
// identified by the URL itself (/:ministry_id.ics), the way a WordPress
// calendar plugin or any external calendar app subscribes to it.
app.use("/api/public/calendar", publicCalendarRoutes);

// All routes below require tenant and auth middleware
app.use("/api", tenantMiddleware);
app.use("/api", authMiddleware);

app.use("/api/flyers", flyerRoutes);
app.use("/api/backgrounds", backgroundRoutes);
app.use("/api/ministry", ministryRoutes);
app.use("/api/profile", aiProfileRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/people", peopleRoutes);
app.use("/api/communications", communicationsRoutes);
app.use("/api/events", eventRoutes);

app.get("/api/test", (req, res) => {
  res.json({ ministry: req.ministryId });
});

app.use((err, req, res, next) => {
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
