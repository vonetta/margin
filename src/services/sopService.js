const SopDraft = require("../models/SopDraft");

// Approved SOP drafts are queried fresh at generation time rather than
// copied into AiProfile.sops on approval — a single source of truth, so an
// edit made to an already-approved draft takes effect immediately instead
// of the two places drifting out of sync.
const withApprovedSops = async (profile, ministryId) => {
  const approved = await SopDraft.find({ ministry_id: ministryId, status: "approved" })
    .select("title content")
    .lean();

  const profileObj = profile.toObject ? profile.toObject() : profile;
  return {
    ...profileObj,
    sops: [...(profileObj.sops || []), ...approved.map((s) => ({ title: s.title, content: s.content }))],
  };
};

module.exports = { withApprovedSops };
