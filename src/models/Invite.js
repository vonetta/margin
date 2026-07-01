const mongoose = require("mongoose");
const crypto = require("crypto");

const inviteSchema = new mongoose.Schema({
  ministry_id: { type: String, required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, trim: true },

  // The role they'll actually get on acceptance — set here rather than
  // left to registration's own "first member becomes admin, everyone
  // else is team" fallback, since an invite is exactly how an admin
  // grants someone leader/admin after the fact.
  role: { type: String, enum: ["admin", "leader", "team"], default: "team" },

  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(24).toString("hex"),
  },

  status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending" },
  invited_by: { type: String, required: true },
  accepted_at: { type: Date },

  // 14 days — long enough that someone doesn't have to act on it
  // immediately, short enough that a stale invite can't be used to join
  // a ministry long after the admin forgot they sent it.
  expires_at: {
    type: Date,
    default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  },

  created_at: { type: Date, default: Date.now },
});

inviteSchema.index({ ministry_id: 1, email: 1, status: 1 });

module.exports = mongoose.model("Invite", inviteSchema);
