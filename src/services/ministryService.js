const Ministry = require("../models/Ministry");

// A ministry's "org family" is itself plus every ministry sharing the
// same root parent — its own parent (if it's a sub-ministry) and every
// sibling under that same parent. This is the only cross-tenant scope
// that's already meant to be visible together (see GET /api/ministry/team
// and /org-overview); membership/relatedness beyond this boundary is
// never assumed anywhere else in the app.
const getOrgFamily = async (ministryId) => {
  const currentMinistry = await Ministry.findOne({ ministry_id: ministryId });
  const rootId = currentMinistry?.parent_ministry_id || ministryId;
  const family = await Ministry.find(
    { $or: [{ ministry_id: rootId }, { parent_ministry_id: rootId }] },
    "ministry_id name",
  );
  return family.map((m) => ({ ministry_id: m.ministry_id, name: m.name }));
};

module.exports = { getOrgFamily };
