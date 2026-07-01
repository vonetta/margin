const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Invite = require("../models/Invite");
const User = require("../models/User");
const { requireRole } = require("../middleware/auth");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const frontendUrl = () =>
  process.env.FRONTEND_URL || "https://margin-app-git-main-vonettas-projects.vercel.app";

const withLink = (invite) => ({
  ...invite.toObject(),
  invite_link: `${frontendUrl()}/join/${invite.token}`,
});

// GET /api/invites — pending invites for this ministry, so an admin can
// see who's already been invited before sending a duplicate.
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const invites = await Invite.find({
      ministry_id: req.ministryId,
      status: "pending",
    }).sort({ created_at: -1 });
    res.json(invites.map(withLink));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

// POST /api/invites
router.post(
  "/",
  requireRole("admin"),
  [
    body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
    body("name").optional().trim(),
    body("role").optional().isIn(["admin", "leader", "team"]).withMessage("Invalid role"),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, name, role } = req.body;

      const existingMember = await User.findOne({
        email,
        "ministries.ministry_id": req.ministryId,
      });
      if (existingMember) {
        return res.status(400).json({ error: "That person is already on the team" });
      }

      const existingInvite = await Invite.findOne({
        ministry_id: req.ministryId,
        email,
        status: "pending",
      });
      if (existingInvite) {
        return res.status(200).json(withLink(existingInvite));
      }

      const invite = await Invite.create({
        ministry_id: req.ministryId,
        email,
        name,
        role: role || "team",
        invited_by: req.userId.toString(),
      });

      res.status(201).json(withLink(invite));
    } catch (error) {
      console.error("Invite creation error:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  },
);

// DELETE /api/invites/:id — revoke a pending invite.
router.delete("/:id", requireRole("admin"), async (req, res) => {
  try {
    const invite = await Invite.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    invite.status = "revoked";
    await invite.save();
    res.json({ revoked: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to revoke invite" });
  }
});

module.exports = router;
