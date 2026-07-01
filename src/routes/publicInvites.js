const express = require("express");
const router = express.Router();
const Invite = require("../models/Invite");
const Ministry = require("../models/Ministry");

// GET /api/public/invites/:token — no auth, no tenant middleware. Lets
// the join page show "You've been invited to X as a Y" and prefill the
// email before the person has an account to authenticate with.
router.get("/:token", async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token });
    if (!invite || invite.status !== "pending") {
      return res.status(404).json({ error: "This invite is invalid or has already been used" });
    }
    if (invite.expires_at < new Date()) {
      return res.status(410).json({ error: "This invite has expired" });
    }

    const ministry = await Ministry.findOne({ ministry_id: invite.ministry_id });

    res.json({
      email: invite.email,
      name: invite.name,
      role: invite.role,
      ministry_id: invite.ministry_id,
      ministry_name: ministry?.name || invite.ministry_id,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to look up invite" });
  }
});

module.exports = router;
