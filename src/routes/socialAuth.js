const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const SocialAccount = require("../models/SocialAccount");
const { requireRole } = require("../middleware/auth");
const { callbackUrl, REQUIRED_SCOPES } = require("../services/metaOAuthConfig");

// GET /api/social/connect — authenticated, admin-only. Returns the Meta
// OAuth dialog URL rather than redirecting server-side, so the frontend
// controls the navigation (consistent with how the rest of the app is a
// client-driven SPA, not server-rendered redirects).
router.get("/connect", requireRole("admin"), async (req, res) => {
  try {
    // Meta round-trips `state` back verbatim in the callback — signing it
    // with the same secret already used for auth tokens both proves it
    // wasn't tampered with in transit and carries which ministry/user
    // actually initiated the request, without needing a new place to
    // persist a CSRF nonce.
    const state = jwt.sign(
      { ministryId: req.ministryId, userId: req.userId.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );

    const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    url.searchParams.set("client_id", process.env.META_APP_ID);
    url.searchParams.set("redirect_uri", callbackUrl());
    url.searchParams.set("scope", REQUIRED_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");

    res.json({ url: url.toString() });
  } catch (error) {
    console.error("Social connect init error:", error);
    res.status(500).json({ error: "Failed to start Meta connection" });
  }
});

// GET /api/social/accounts — authenticated, tenant-scoped. Never returns
// the encrypted token itself.
router.get("/accounts", requireRole("admin", "leader"), async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ ministry_id: req.ministryId }).select(
      "-page_access_token",
    );
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch connected accounts" });
  }
});

// DELETE /api/social/accounts/:id
router.delete("/accounts/:id", requireRole("admin"), async (req, res) => {
  try {
    const account = await SocialAccount.findOneAndDelete({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!account) return res.status(404).json({ error: "Connected account not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

module.exports = router;
