// Thin wrapper around the Meta Graph API calls needed for the OAuth
// connect flow: exchange the OAuth code, upgrade to a long-lived token,
// then discover the Pages (and any linked Instagram Business accounts)
// that token can act on. Deliberately separate from the future posting
// service — this module only ever runs during connect/refresh, never
// during the actual post-publishing flow.
const GRAPH_API_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const metaAppId = () => process.env.META_APP_ID;
const metaAppSecret = () => process.env.META_APP_SECRET;

const graphGet = async (path, params) => {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, value);
  });
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message || "Meta Graph API error");
    err.metaError = data.error;
    throw err;
  }
  return data;
};

// Step 1 of the OAuth handshake: the `code` param Meta appended to the
// redirect_uri gets exchanged for a short-lived (~1-2 hour) user token.
const exchangeCodeForToken = (code, redirectUri) =>
  graphGet("/oauth/access_token", {
    client_id: metaAppId(),
    client_secret: metaAppSecret(),
    redirect_uri: redirectUri,
    code,
  });

// Step 2: trade the short-lived token for a long-lived one (~60 days).
// Page tokens minted from a long-lived user token effectively don't
// expire in practice, which is what makes this worth doing rather than
// just using the short-lived token directly.
const exchangeForLongLivedToken = (shortLivedToken) =>
  graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: metaAppId(),
    client_secret: metaAppSecret(),
    fb_exchange_token: shortLivedToken,
  });

// Lists every Facebook Page the connecting user manages, each with its
// own Page access token — this is what's actually stored and used to
// post, not the user token itself.
const listManagedPages = (userAccessToken) =>
  graphGet("/me/accounts", {
    access_token: userAccessToken,
    fields: "id,name,access_token",
  }).then((res) => res.data || []);

// Instagram Business accounts are only reachable via their linked Page —
// this checks whether one exists and pulls its id/username for display.
const getLinkedInstagramAccount = async (pageId, pageAccessToken) => {
  const res = await graphGet(`/${pageId}`, {
    access_token: pageAccessToken,
    fields: "instagram_business_account{id,username}",
  });
  return res.instagram_business_account || null;
};

module.exports = {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listManagedPages,
  getLinkedInstagramAccount,
};
