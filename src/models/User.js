const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ministryMembershipSchema = new mongoose.Schema(
  {
    ministry_id: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "leader", "team"],
      default: "team",
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true, minlength: 8, select: false },
  name: { type: String, required: true, trim: true },
  ministries: [ministryMembershipSchema],
  is_active: { type: Boolean, default: true },
  last_login: { type: Date },
  created_at: { type: Date, default: Date.now },
});

userSchema.index({ "ministries.ministry_id": 1 });

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getMembership = function (ministry_id) {
  return this.ministries.find((m) => m.ministry_id === ministry_id) || null;
};

userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model("User", userSchema);
