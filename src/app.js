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
dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

connectDB();

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors());
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

// All routes below require tenant and auth middleware
app.use("/api", tenantMiddleware);
app.use("/api", authMiddleware);

app.use("/api/flyers", flyerRoutes);
app.use("/api/backgrounds", backgroundRoutes);
app.use("/api/ministry", ministryRoutes);
app.use("/api/profile", aiProfileRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/people", peopleRoutes);

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
