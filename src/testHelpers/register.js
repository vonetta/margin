const request = require("supertest");
const Invite = require("../models/Invite");

// Registration requires an invite for everyone after a ministry's first
// member, so test suites can't just POST /api/auth/register N times onto
// the same test ministry anymore. This helper mints a real pending Invite
// document (the same thing an admin's "Add member" produces) and registers
// through it — exercising the actual invite path rather than bypassing it
// with direct User.create.
const registerMember = async (app, { ministry_id, email, password, name, role = "team" }) => {
  const invite = await Invite.create({
    ministry_id,
    email,
    role,
    invited_by: "test-suite",
  });
  return request(app).post("/api/auth/register").send({
    email,
    password,
    name,
    ministry_id,
    invite_token: invite.token,
  });
};

module.exports = { registerMember };
