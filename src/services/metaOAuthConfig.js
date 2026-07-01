// Shared between the authenticated connect-initiation route and the
// public callback route — kept in one place so the redirect_uri Meta
// receives at each step of the handshake can never drift out of sync
// (Meta requires an exact string match between the two).
const frontendUrl = () =>
  process.env.FRONTEND_URL || "https://margin-app-git-main-vonettas-projects.vercel.app";

const backendUrl = () =>
  process.env.BACKEND_URL || "https://margin-production-6bc4.up.railway.app";

const callbackUrl = () => `${backendUrl()}/api/social/callback`;

const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

module.exports = { frontendUrl, backendUrl, callbackUrl, REQUIRED_SCOPES };
