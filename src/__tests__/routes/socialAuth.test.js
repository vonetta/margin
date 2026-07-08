const mockExchangeCodeForToken = jest.fn();
const mockExchangeForLongLivedToken = jest.fn();
const mockListManagedPages = jest.fn();
const mockGetLinkedInstagramAccount = jest.fn();
jest.mock("../../services/metaGraphService", () => ({
  exchangeCodeForToken: (...args) => mockExchangeCodeForToken(...args),
  exchangeForLongLivedToken: (...args) => mockExchangeForLongLivedToken(...args),
  listManagedPages: (...args) => mockListManagedPages(...args),
  getLinkedInstagramAccount: (...args) => mockGetLinkedInstagramAccount(...args),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { connectTestDB } = require("../../testHelpers/db");
const { registerMember } = require("../../testHelpers/register");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const User = require("../../models/User");
const SocialAccount = require("../../models/SocialAccount");
const { decrypt } = require("../../services/encryption");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "Khy Traylor Global Ministries",
  plan: "enterprise",
};

let adminToken, adminId, teamToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await SocialAccount.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: { $in: ["social-admin@ktm.com", "social-team@ktm.com"] } });
});

beforeEach(async () => {
  jest.clearAllMocks();
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await SocialAccount.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({ email: { $in: ["social-admin@ktm.com", "social-team@ktm.com"] } });
  await Ministry.create(testMinistry);

  const a = await request(app).post("/api/auth/register").send({
    email: "social-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = a.body.token;
  adminId = a.body.user.id;

  const t = await registerMember(app, {
    email: "social-team@ktm.com",
    password: "Password123",
    name: "Team",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = t.body.token;
});

describe("GET /api/social/connect", () => {
  it("returns a Meta OAuth URL with a signed state carrying the ministry and user", async () => {
    const res = await request(app)
      .get("/api/social/connect")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("client_id")).toBe(process.env.META_APP_ID);
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");

    const state = url.searchParams.get("state");
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    expect(decoded.ministryId).toBe("ktm-test");
  });

  it("rejects a non-admin (team) from initiating a connection", async () => {
    const res = await request(app)
      .get("/api/social/connect")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/social/callback", () => {
  const signState = (overrides = {}) =>
    jwt.sign(
      { ministryId: "ktm-test", userId: adminId, ...overrides },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );

  it("completes the handshake and stores an encrypted Page token, discovering a linked Instagram account", async () => {
    mockExchangeCodeForToken.mockResolvedValue({ access_token: "short-lived-token" });
    mockExchangeForLongLivedToken.mockResolvedValue({ access_token: "long-lived-user-token" });
    mockListManagedPages.mockResolvedValue([
      { id: "page-123", name: "KTM Main Page", access_token: "page-access-token-abc" },
    ]);
    mockGetLinkedInstagramAccount.mockResolvedValue({ id: "ig-456", username: "ktm_ministries" });

    const res = await request(app)
      .get("/api/social/callback")
      .query({ code: "auth-code-xyz", state: signState() });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("social=connected");

    const stored = await SocialAccount.findOne({ ministry_id: "ktm-test", platform_page_id: "page-123" });
    expect(stored).toBeTruthy();
    expect(stored.page_name).toBe("KTM Main Page");
    expect(stored.instagram_business_account_id).toBe("ig-456");
    expect(stored.instagram_username).toBe("ktm_ministries");
    // The stored value must be encrypted, not the raw token
    expect(stored.page_access_token).not.toBe("page-access-token-abc");
    expect(decrypt(stored.page_access_token)).toBe("page-access-token-abc");
  });

  it("stores a Page with no linked Instagram account fine, just without IG fields", async () => {
    mockExchangeCodeForToken.mockResolvedValue({ access_token: "short-lived-token" });
    mockExchangeForLongLivedToken.mockResolvedValue({ access_token: "long-lived-user-token" });
    mockListManagedPages.mockResolvedValue([
      { id: "page-no-ig", name: "Youth Page", access_token: "page-token-2" },
    ]);
    mockGetLinkedInstagramAccount.mockRejectedValue(new Error("no instagram_business_account field"));

    const res = await request(app)
      .get("/api/social/callback")
      .query({ code: "auth-code-xyz", state: signState() });

    expect(res.status).toBe(302);
    const stored = await SocialAccount.findOne({ ministry_id: "ktm-test", platform_page_id: "page-no-ig" });
    expect(stored).toBeTruthy();
    expect(stored.instagram_business_account_id).toBeUndefined();
  });

  it("redirects with an error indicator if Meta denied the request", async () => {
    const res = await request(app)
      .get("/api/social/callback")
      .query({ error: "access_denied", state: signState() });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("social=denied");
    expect(mockExchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("redirects with an error indicator for a tampered/invalid state", async () => {
    const res = await request(app)
      .get("/api/social/callback")
      .query({ code: "auth-code-xyz", state: "not-a-real-jwt" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("social=invalid_state");
  });

  it("redirects with an error indicator if the token exchange fails", async () => {
    mockExchangeCodeForToken.mockRejectedValue(new Error("Meta API down"));

    const res = await request(app)
      .get("/api/social/callback")
      .query({ code: "auth-code-xyz", state: signState() });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("social=error");
  });

  it("re-connecting the same Page updates it in place rather than duplicating", async () => {
    mockExchangeCodeForToken.mockResolvedValue({ access_token: "short-lived-token" });
    mockExchangeForLongLivedToken.mockResolvedValue({ access_token: "long-lived-user-token" });
    mockListManagedPages.mockResolvedValue([
      { id: "page-dup", name: "KTM Main Page", access_token: "token-v1" },
    ]);
    mockGetLinkedInstagramAccount.mockResolvedValue(null);

    await request(app).get("/api/social/callback").query({ code: "c1", state: signState() });

    mockListManagedPages.mockResolvedValue([
      { id: "page-dup", name: "KTM Main Page (renamed)", access_token: "token-v2" },
    ]);
    await request(app).get("/api/social/callback").query({ code: "c2", state: signState() });

    const all = await SocialAccount.find({ ministry_id: "ktm-test", platform_page_id: "page-dup" });
    expect(all.length).toBe(1);
    expect(all[0].page_name).toBe("KTM Main Page (renamed)");
    expect(decrypt(all[0].page_access_token)).toBe("token-v2");
  });
});

describe("GET /api/social/accounts", () => {
  it("lists connected accounts without ever exposing the token", async () => {
    await SocialAccount.create({
      ministry_id: "ktm-test",
      platform_page_id: "page-1",
      page_name: "KTM Page",
      page_access_token: "encrypted-placeholder",
      connected_by: adminId,
    });

    const res = await request(app)
      .get("/api/social/accounts")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].page_name).toBe("KTM Page");
    expect(res.body[0].page_access_token).toBeUndefined();
  });
});

describe("DELETE /api/social/accounts/:id", () => {
  it("disconnects an account", async () => {
    const account = await SocialAccount.create({
      ministry_id: "ktm-test",
      platform_page_id: "page-1",
      page_name: "KTM Page",
      page_access_token: "encrypted-placeholder",
      connected_by: adminId,
    });

    const res = await request(app)
      .delete(`/api/social/accounts/${account._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const remaining = await SocialAccount.findById(account._id);
    expect(remaining).toBeNull();
  });

  it("rejects a non-admin (team) from disconnecting an account", async () => {
    const account = await SocialAccount.create({
      ministry_id: "ktm-test",
      platform_page_id: "page-1",
      page_name: "KTM Page",
      page_access_token: "encrypted-placeholder",
      connected_by: adminId,
    });

    const res = await request(app)
      .delete(`/api/social/accounts/${account._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(403);
  });
});
