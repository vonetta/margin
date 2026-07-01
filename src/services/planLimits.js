// Usage caps by plan tier — every feature stays available at every
// tier, only volume is capped. Enterprise is uncapped by design (no
// ministry should ever hit a wall there). Infinity serializes to `null`
// over JSON (res.json → JSON.stringify), which doubles as the API's
// "unlimited" signal — the frontend should treat a null limit that way,
// not as missing/broken data.
const PLAN_LIMITS = {
  small: { team_members: 5, sub_ministries: 0, flyers_per_month: 15 },
  mid: { team_members: 20, sub_ministries: 3, flyers_per_month: 60 },
  enterprise: { team_members: Infinity, sub_ministries: Infinity, flyers_per_month: Infinity },
};

// Unknown/missing plan falls back to small — the same default the
// Ministry model itself uses, so an un-set plan is never accidentally
// unlimited.
const limitsFor = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.small;

const RESOURCE_LABELS = {
  team_members: "team members",
  sub_ministries: "sub-ministries",
  flyers_per_month: "flyers per month",
};

const planLimitError = (resource, plan) => {
  const limit = limitsFor(plan)[resource];
  return `Your ${plan} plan allows up to ${limit} ${RESOURCE_LABELS[resource]}. Upgrade your plan to add more.`;
};

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

module.exports = { PLAN_LIMITS, limitsFor, planLimitError, startOfMonth };
