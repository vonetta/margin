const mongoose = require("mongoose");

const socialAccountSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },

  // A ministry can connect more than one Facebook Page (e.g. a main
  // church page and a youth ministry page) — one SocialAccount per Page,
  // rather than a single slot per ministry.
  platform_page_id: { type: String, required: true },
  page_name: { type: String },

  // Encrypted (services/encryption.js) — a real Meta Page access token,
  // not a password, so it needs to be reversible, unlike bcrypt-hashed
  // fields elsewhere in this codebase.
  page_access_token: { type: String, required: true },

  // Instagram Business accounts are always accessed through their linked
  // Facebook Page's token, not a separate IG credential — null/absent
  // means this Page has no Instagram account linked.
  instagram_business_account_id: { type: String },
  instagram_username: { type: String },

  connected_by: { type: String, required: true },
  connected_at: { type: Date, default: Date.now },
  token_refreshed_at: { type: Date, default: Date.now },

  status: {
    type: String,
    enum: ["active", "expired", "error"],
    default: "active",
  },
  last_error: { type: String },
});

socialAccountSchema.index({ ministry_id: 1, platform_page_id: 1 }, { unique: true });

module.exports = mongoose.model("SocialAccount", socialAccountSchema);
