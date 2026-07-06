const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    const membership = user.getMembership(req.ministryId);

    if (!membership) {
      return res.status(403).json({ error: "Access denied to this ministry" });
    }

    req.user = user;
    req.userId = user._id;
    req.userRole = membership.role;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(500).json({ error: "Authentication failed" });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

// Backend counterpart to the frontend's ProtectedRoute requireOnboarding
// gate — mirrors that same profile-dependent-surfaces boundary (Content
// Studio, Flyers, Social Queue) so a direct API call can't bypass what
// the UI enforces. Everything else (calendar, tasks, team, people) stays
// reachable pre-onboarding on the backend too, matching the frontend.
const requireOnboarding = (req, res, next) => {
  if (!req.ministry.onboarding_complete) {
    return res.status(403).json({ error: "Finish onboarding before using this feature" });
  }
  next();
};

module.exports = { authMiddleware, requireRole, requireOnboarding };
