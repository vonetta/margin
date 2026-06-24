const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Ministry = require("../models/Ministry");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// POST /api/auth/register
router.post(
  "/register",
  [
    body("email")
      .isEmail()
      .withMessage("Valid email is required")
      .normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("ministry_id")
      .trim()
      .notEmpty()
      .withMessage("Ministry ID is required"),
    body("role")
      .optional()
      .isIn(["admin", "leader", "team"])
      .withMessage("Invalid role"),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password, name, ministry_id, role } = req.body;

      const ministry = await Ministry.findOne({ ministry_id });
      if (!ministry) {
        return res.status(404).json({ error: "Ministry not found" });
      }

      // Self-service registration has no invite flow yet, so anyone who
      // knows a ministry_id can join it — but only the very first member
      // may grant themselves elevated access. Everyone after that is
      // added as "team" regardless of what they request; an existing
      // admin/leader must promote them via PUT /api/people or similar.
      const existingMemberCount = await User.countDocuments({
        "ministries.ministry_id": ministry_id,
      });
      const assignedRole = existingMemberCount === 0 ? role || "admin" : "team";

      const hashedPassword = await bcrypt.hash(password, 12);

      let user = await User.findOne({ email });

      if (user) {
        const alreadyMember = user.getMembership(ministry_id);
        if (alreadyMember) {
          return res
            .status(400)
            .json({ error: "Already a member of this ministry" });
        }
        user.ministries.push({ ministry_id, role: assignedRole });
        await user.save();
      } else {
        user = await User.create({
          email,
          password: hashedPassword,
          name,
          ministries: [{ ministry_id, role: assignedRole }],
        });
      }

      const token = signToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          ministries: user.ministries,
        },
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  },
);

// POST /api/auth/login
router.post(
  "/login",
  [
    body("email")
      .isEmail()
      .withMessage("Valid email is required")
      .normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select("+password");

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (!user.is_active) {
        return res.status(401).json({ error: "Account is inactive" });
      }

      user.last_login = new Date();
      await user.save();

      const token = signToken(user._id);

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          ministries: user.ministries,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  },
);

// GET /api/auth/me
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
