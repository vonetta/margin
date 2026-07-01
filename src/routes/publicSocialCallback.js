const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const SocialAccount = require("../models/SocialAccount");
const { encrypt } = require("../services/encryption");
const { frontendUrl, callbackUrl } = require("../services/metaOAuthConfig");
const {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listManagedPages,
  getLinkedInstagramAccount,
} = require("../services/metaGraphService");

// GET /api/social/callback — public, no tenant/auth middleware. This is
// a raw browser navigation from Meta after the user approves the
// connection, not an API call from our own frontend, so there's no
// bearer token to authenticate with here — the signed `state` param is
// what ties this back to a specific ministry/user instead.
router.get("/", async (req, res) => {
  const { code, state, error: metaError } = req.query;

  if (metaError) {
    return res.redirect(`${frontendUrl()}/profile?social=denied`);
  }

  let ministryId, userId;
  try {
    ({ ministryId, userId } = jwt.verify(state, process.env.JWT_SECRET));
  } catch (error) {
    return res.redirect(`${frontendUrl()}/profile?social=invalid_state`);
  }

  try {
    const shortLived = await exchangeCodeForToken(code, callbackUrl());
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const pages = await listManagedPages(longLived.access_token);

    for (const page of pages) {
      let instagram = null;
      try {
        instagram = await getLinkedInstagramAccount(page.id, page.access_token);
      } catch (igError) {
        // A Page with no linked Instagram account errors on this field
        // rather than just returning null — that's expected, not fatal.
      }

      await SocialAccount.findOneAndUpdate(
        { ministry_id: ministryId, platform_page_id: page.id },
        {
          ministry_id: ministryId,
          platform_page_id: page.id,
          page_name: page.name,
          page_access_token: encrypt(page.access_token),
          instagram_business_account_id: instagram?.id,
          instagram_username: instagram?.username,
          connected_by: userId,
          connected_at: new Date(),
          token_refreshed_at: new Date(),
          status: "active",
          last_error: undefined,
        },
        { upsert: true, returnDocument: "after" },
      );
    }

    res.redirect(`${frontendUrl()}/profile?social=connected`);
  } catch (error) {
    console.error("Meta OAuth callback error:", error.metaError || error.message);
    res.redirect(`${frontendUrl()}/profile?social=error`);
  }
});

module.exports = router;
