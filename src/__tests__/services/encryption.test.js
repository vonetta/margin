const crypto = require("crypto");

describe("encryption", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  });

  afterAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  // Re-require after setting the env var, since the module reads it lazily
  // per-call (getKey()) rather than at import time — no reset needed, but
  // keep this isolated from other test files' env mutations regardless.
  const { encrypt, decrypt } = require("../../services/encryption");

  it("round-trips a value through encrypt/decrypt", () => {
    const token = "EAABsbCS1234567890abcdefLONGLIVEDTOKEN";
    const encrypted = encrypt(token);
    expect(encrypted).not.toContain(token);
    expect(decrypt(encrypted)).toBe(token);
  });

  it("produces different ciphertext for the same input each time (random IV)", () => {
    const token = "same-input-twice";
    expect(encrypt(token)).not.toBe(encrypt(token));
  });

  it("throws instead of silently returning garbage if the ciphertext is tampered with", () => {
    const encrypted = encrypt("a secret token");
    const tampered = encrypted.slice(0, -4) + "0000";
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws a clear error if TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  });
});
