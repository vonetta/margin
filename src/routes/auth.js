const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Ministry = require("../models/Ministry");
const AiProfile = require("../models/AiProfile");
const Invite = require("../models/Invite");
const { limitsFor, planLimitError } = require("../services/planLimits");

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
    body("invite_token").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password, name, ministry_id, role, invite_token } = req.body;

      const ministry = await Ministry.findOne({ ministry_id });
      if (!ministry) {
        return res.status(404).json({ error: "Ministry not found" });
      }

      const existingMemberCount = await User.countDocuments({
        "ministries.ministry_id": ministry_id,
        is_active: true,
      });
      // Applies to every path onto the roster — self-service registration
      // and invite acceptance alike — since both end in one more active
      // membership on this ministry. The very first member is always
      // exempt (0 < any real limit), so bootstrapping a new ministry
      // never trips this.
      if (existingMemberCount >= limitsFor(ministry.plan).team_members) {
        return res.status(402).json({ error: planLimitError("team_members", ministry.plan) });
      }

      let assignedRole;
      let invite = null;

      if (invite_token) {
        invite = await Invite.findOne({ token: invite_token, ministry_id, status: "pending" });
        if (!invite || invite.expires_at < new Date()) {
          return res.status(400).json({ error: "This invite is invalid or has expired" });
        }
        if (invite.email !== email) {
          return res.status(400).json({ error: "This invite was sent to a different email address" });
        }
        // The whole point of an invite: the admin who sent it decided the
        // role, not whatever the registration form happens to submit.
        assignedRole = invite.role;
      } else {
        // Self-service registration without an invite still works (e.g. a
        // ministry sharing its own ministry_id directly) — but only the
        // very first member may grant themselves elevated access.
        // Everyone after that is "team" unless an admin invites them at a
        // higher role or promotes them via the Team page.
        assignedRole = existingMemberCount === 0 ? role || "admin" : "team";
      }

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

      if (invite) {
        invite.status = "accepted";
        invite.accepted_at = new Date();
        await invite.save();
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

// POST /api/auth/register-ministry
// Self-serve entry point for a brand-new ministry — unlike /register,
// which requires an existing ministry_id, this creates the Ministry (and
// its empty AiProfile shell, same as the sub-ministry creation path) and
// its first admin in one call. That first admin is always "admin"; there
// is no invite/role negotiation because nobody else is a member yet.
// onboarding_complete stays false so the frontend can route them straight
// into the onboarding flow.
router.post(
  "/register-ministry",
  [
    body("ministry_id")
      .trim()
      .notEmpty()
      .withMessage("Ministry ID is required")
      .matches(/^[a-z0-9-]+$/)
      .withMessage(
        "Ministry ID must be lowercase letters, numbers, and hyphens only",
      ),
    body("ministry_name").trim().notEmpty().withMessage("Ministry name is required"),
    body("email")
      .isEmail()
      .withMessage("Valid email is required")
      .normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("name").trim().notEmpty().withMessage("Name is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { ministry_id, ministry_name, email, password, name } = req.body;

      const existingMinistry = await Ministry.findOne({ ministry_id });
      if (existingMinistry) {
        return res.status(400).json({ error: "Ministry ID already in use" });
      }

      let user = await User.findOne({ email });
      if (user && user.getMembership(ministry_id)) {
        return res.status(400).json({ error: "Already a member of this ministry" });
      }

      await Ministry.create({ ministry_id, name: ministry_name });

      await AiProfile.create({
        ministry_id,
        voice_profile: {
          persona_name: ministry_name,
          sign_off: "",
          tone_pillars: [],
          sample_phrases: [],
          avoid: [],
        },
        hashtags: { brand: [], content: [] },
        sops: [],
        templates: [],
        recurring_content: [],
      });

      if (user) {
        user.ministries.push({ ministry_id, role: "admin" });
        await user.save();
      } else {
        const hashedPassword = await bcrypt.hash(password, 12);
        user = await User.create({
          email,
          password: hashedPassword,
          name,
          ministries: [{ ministry_id, role: "admin" }],
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
      console.error("Register ministry error:", error);
      res.status(500).json({ error: "Ministry registration failed" });
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

    const ministryIds = user.ministries.map((m) => m.ministry_id);
    const ministries = await Ministry.find(
      { ministry_id: { $in: ministryIds } },
      "ministry_id name tagline parent_ministry_id branding.colors.primary",
    );
    const ministryById = new Map(
      ministries.map((m) => [m.ministry_id, m]),
    );

    const userJson = user.toJSON();
    userJson.ministries = userJson.ministries.map((m) => {
      const ministry = ministryById.get(m.ministry_id);
      return {
        ...m,
        name: ministry?.name || m.ministry_id,
        tagline: ministry?.tagline,
        parent_ministry_id: ministry?.parent_ministry_id || null,
        color: ministry?.branding?.colors?.primary || null,
      };
    });

    res.json(userJson);
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
