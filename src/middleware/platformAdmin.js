const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Deliberately independent of tenantMiddleware/authMiddleware — this is
// platform-operator visibility across every ministry, not scoped to any
// one tenant, so it can't reuse the x-ministry-id-based tenant chain.
// Mounted before that chain in app.js, same as /api/auth.
const requirePlatformAdmin = async (req, res, next) => {
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

    if (!user.is_platform_admin) {
      return res.status(403).json({ error: "Platform admin access required" });
    }

    req.user = user;
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

module.exports = { requirePlatformAdmin };
