// Publishes an approved SocialPost to each of its targets via the Meta
// Graph API. The actual posting mechanics (container-wait-then-publish
// for Instagram, retry-on-transient-error) are ported near-verbatim from
// the standalone Airtable bridge this replaces — that logic was already
// solid and tested in production, so it isn't being reinvented, just
// re-pointed at per-ministry connected accounts instead of static env
// config.
const SocialAccount = require("../models/SocialAccount");
const SocialPost = require("../models/SocialPost");
const { decrypt } = require("./encryption");

const GRAPH_API_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Standardizes brand text the same way the old bridge did — no em
// dashes in published captions.
const cleanText = (text) => (text ? text.replace(/—/g, " - ") : "");

const isMetaErrorRetryable = (err) => {
  const status = err.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  const e = err.metaError;
  if (e?.code === 190 || e?.code === 200) return false;
  return e?.is_transient || e?.code === 2;
};

const withMetaRetry = async (label, fn) => {
  const attempts = 4;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isMetaErrorRetryable(e) || i === attempts - 1) throw e;
      console.warn(`[${label}] Retrying attempt ${i + 2}...`);
      await new Promise((r) => setTimeout(r, 5000 * Math.pow(2, i)));
    }
  }
};

const graphPost = async (path, body) => {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message || "Meta Graph API error");
    err.metaError = data.error;
    throw err;
  }
  return data;
};

const graphGetStatus = async (containerId, token) => {
  const url = new URL(`${GRAPH_BASE}/${containerId}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  return res.json();
};

const waitForInstagramContainer = async (containerId, token) => {
  const maxWaitMs = 120000;
  const intervalMs = 3000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const data = await graphGetStatus(containerId, token);
    if (data.status_code === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(data.status_code)) {
      throw new Error(`IG Container Failed: ${data.status_code}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Instagram container timeout");
};

// --- Facebook ---

const postToFacebook = (caption, url, pageId, token) =>
  withMetaRetry("Facebook Single", () =>
    graphPost(`/${pageId}/photos`, { url, message: caption, access_token: token }),
  );

const postFacebookCarousel = (caption, urls, pageId, token) =>
  withMetaRetry("Facebook Carousel", async () => {
    const mediaIds = await Promise.all(
      urls.map(async (url) => {
        const res = await graphPost(`/${pageId}/photos`, { url, published: false, access_token: token });
        return res.id;
      }),
    );
    return graphPost(`/${pageId}/feed`, {
      message: caption,
      attached_media: mediaIds.map((id) => ({ media_fbid: id })),
      access_token: token,
    });
  });

const postVideoToFacebook = (caption, url, pageId, token) =>
  withMetaRetry("Facebook Video", () =>
    graphPost(`/${pageId}/videos`, { file_url: url, description: caption, access_token: token }),
  );

// --- Instagram ---

const postToInstagram = (caption, url, igId, token) =>
  withMetaRetry("Instagram Single", async () => {
    const container = await graphPost(`/${igId}/media`, { image_url: url, caption, access_token: token });
    await waitForInstagramContainer(container.id, token);
    return graphPost(`/${igId}/media_publish`, { creation_id: container.id, access_token: token });
  });

const postInstagramCarousel = (caption, urls, igId, token) =>
  withMetaRetry("Instagram Carousel", async () => {
    const itemIds = await Promise.all(
      urls.slice(0, 10).map(async (url) => {
        const res = await graphPost(`/${igId}/media`, { image_url: url, is_carousel_item: true, access_token: token });
        return res.id;
      }),
    );
    await Promise.all(itemIds.map((id) => waitForInstagramContainer(id, token)));
    const carousel = await graphPost(`/${igId}/media`, {
      caption,
      media_type: "CAROUSEL",
      children: itemIds,
      access_token: token,
    });
    await waitForInstagramContainer(carousel.id, token);
    return graphPost(`/${igId}/media_publish`, { creation_id: carousel.id, access_token: token });
  });

const postVideoToInstagram = (caption, url, igId, token, isReel) =>
  withMetaRetry(isReel ? "Instagram Reel" : "Instagram Video", async () => {
    const params = isReel
      ? { media_type: "REELS", video_url: url, caption, access_token: token }
      : { media_type: "VIDEO", video_url: url, caption, access_token: token };
    const container = await graphPost(`/${igId}/media`, params);
    await waitForInstagramContainer(container.id, token);
    return graphPost(`/${igId}/media_publish`, { creation_id: container.id, access_token: token });
  });

// --- Orchestration ---

const publishToTarget = async (post, target, socialAccount) => {
  const token = decrypt(socialAccount.page_access_token);
  const caption = cleanText(post.caption);
  const urls = post.graphic_urls;

  if (target.platform === "facebook") {
    const pageId = socialAccount.platform_page_id;
    if (post.post_type === "image") return postToFacebook(caption, urls[0], pageId, token);
    if (post.post_type === "carousel") return postFacebookCarousel(caption, urls, pageId, token);
    return postVideoToFacebook(caption, urls[0], pageId, token);
  }

  // instagram
  const igId = socialAccount.instagram_business_account_id;
  if (!igId) throw new Error("This account has no linked Instagram Business account");
  if (post.post_type === "image") return postToInstagram(caption, urls[0], igId, token);
  if (post.post_type === "carousel") return postInstagramCarousel(caption, urls, igId, token);
  return postVideoToInstagram(caption, urls[0], igId, token, post.post_type === "reel");
};

// Attempts every target, records a per-target result regardless of
// outcome, and marks the post "posted" as long as at least one target
// succeeded — a post that goes out to Facebook but fails on Instagram
// still needs to read as "live," with the failure visible for
// troubleshooting rather than hidden behind an all-or-nothing status.
const publishPost = async (post) => {
  const results = [];

  for (const target of post.targets) {
    try {
      const socialAccount = await SocialAccount.findOne({
        _id: target.social_account_id,
        ministry_id: post.ministry_id,
      });
      if (!socialAccount) throw new Error("Connected account no longer exists");

      const response = await publishToTarget(post, target, socialAccount);
      results.push({
        social_account_id: target.social_account_id,
        platform: target.platform,
        status: "success",
        external_post_id: response?.id || response?.post_id,
        posted_at: new Date(),
      });
    } catch (error) {
      console.error(`Social post ${post._id} failed on ${target.platform}:`, error.metaError || error.message);
      results.push({
        social_account_id: target.social_account_id,
        platform: target.platform,
        status: "failed",
        error: error.metaError?.message || error.message,
        posted_at: new Date(),
      });
    }
  }

  const anySucceeded = results.some((r) => r.status === "success");
  await SocialPost.findByIdAndUpdate(post._id, {
    status: anySucceeded ? "posted" : "failed",
    post_results: results,
  });

  return results;
};

module.exports = { publishPost };
