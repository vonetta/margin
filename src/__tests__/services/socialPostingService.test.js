const originalFetch = global.fetch;

const { connectTestDB } = require("../../testHelpers/db");
const Ministry = require("../../models/Ministry");
const SocialAccount = require("../../models/SocialAccount");
const SocialPost = require("../../models/SocialPost");
const { encrypt } = require("../../services/encryption");
const { publishPost } = require("../../services/socialPostingService");

beforeAll(async () => {
  await connectTestDB();
  await Ministry.create({ ministry_id: "posting-test", name: "Posting Test", plan: "enterprise" });
});

afterAll(async () => {
  global.fetch = originalFetch;
  await Ministry.deleteMany({ ministry_id: "posting-test" });
  await SocialAccount.deleteMany({ ministry_id: "posting-test" });
  await SocialPost.deleteMany({ ministry_id: "posting-test" });
});

beforeEach(async () => {
  await SocialAccount.deleteMany({ ministry_id: "posting-test" });
  await SocialPost.deleteMany({ ministry_id: "posting-test" });
});

const makeAccount = (overrides = {}) =>
  SocialAccount.create({
    ministry_id: "posting-test",
    platform_page_id: "page-1",
    page_name: "Test Page",
    page_access_token: encrypt("real-page-token"),
    connected_by: "user1",
    ...overrides,
  });

const jsonResponse = (body) => Promise.resolve({ json: () => Promise.resolve(body) });

describe("publishPost", () => {
  it("posts a single image to Facebook and records a success result", async () => {
    const account = await makeAccount();
    const post = await SocialPost.create({
      ministry_id: "posting-test",
      caption: "Join us Sunday—great things ahead",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      status: "approved",
      created_by: "user1",
      targets: [{ social_account_id: account._id.toString(), platform: "facebook" }],
    });

    global.fetch = jest.fn().mockImplementation((url, opts) => {
      expect(url).toContain("/page-1/photos");
      const body = JSON.parse(opts.body);
      // The bridge's em-dash sanitizer must still apply.
      expect(body.message).toBe("Join us Sunday - great things ahead");
      expect(body.access_token).toBe("real-page-token");
      return jsonResponse({ id: "fb_post_123" });
    });

    const results = await publishPost(post);
    expect(results).toEqual([
      expect.objectContaining({ platform: "facebook", status: "success", external_post_id: "fb_post_123" }),
    ]);

    const updated = await SocialPost.findById(post._id);
    expect(updated.status).toBe("posted");
  });

  it("marks the post failed if all targets fail, keeping the error per-target", async () => {
    const account = await makeAccount();
    const post = await SocialPost.create({
      ministry_id: "posting-test",
      caption: "Test",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      status: "approved",
      created_by: "user1",
      targets: [{ social_account_id: account._id.toString(), platform: "facebook" }],
    });

    global.fetch = jest.fn().mockImplementation(() =>
      jsonResponse({ error: { message: "Invalid OAuth access token", code: 190 } }),
    );

    const results = await publishPost(post);
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toBe("Invalid OAuth access token");

    const updated = await SocialPost.findById(post._id);
    expect(updated.status).toBe("failed");
  });

  it("marks the post posted if at least one target succeeds even if another fails", async () => {
    const fbAccount = await makeAccount({ platform_page_id: "page-fb" });
    const igAccount = await makeAccount({
      platform_page_id: "page-ig",
      instagram_business_account_id: "ig-1",
    });
    const post = await SocialPost.create({
      ministry_id: "posting-test",
      caption: "Test",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      status: "approved",
      created_by: "user1",
      targets: [
        { social_account_id: fbAccount._id.toString(), platform: "facebook" },
        { social_account_id: igAccount._id.toString(), platform: "instagram" },
      ],
    });

    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/page-fb/photos")) return jsonResponse({ id: "fb_ok" });
      if (url.includes("/ig-1/media") && !url.includes("media_publish")) {
        return jsonResponse({ error: { message: "IG rate limited", code: 4, is_transient: false } });
      }
      return jsonResponse({ error: { message: "unexpected call" } });
    });

    const results = await publishPost(post);
    const fbResult = results.find((r) => r.platform === "facebook");
    const igResult = results.find((r) => r.platform === "instagram");
    expect(fbResult.status).toBe("success");
    expect(igResult.status).toBe("failed");

    const updated = await SocialPost.findById(post._id);
    expect(updated.status).toBe("posted");
  });

  it("fails cleanly with a clear error if the target's Instagram account isn't actually linked", async () => {
    const account = await makeAccount(); // no instagram_business_account_id set
    const post = await SocialPost.create({
      ministry_id: "posting-test",
      caption: "Test",
      graphic_urls: ["https://example.com/flyer.png"],
      post_type: "image",
      status: "approved",
      created_by: "user1",
      targets: [{ social_account_id: account._id.toString(), platform: "instagram" }],
    });

    global.fetch = jest.fn();
    const results = await publishPost(post);
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toMatch(/no linked Instagram/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
