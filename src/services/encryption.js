const crypto = require("crypto");

// Reversible (not one-way like bcrypt) encryption for secrets we need the
// real value back out of — social account access tokens, specifically.
// AES-256-GCM: a random IV per call (never reused with the same key) plus
// an auth tag that lets decrypt() detect tampering/corruption instead of
// silently returning garbage.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getKey = () => {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte value, hex-encoded (64 hex characters)");
  }
  return key;
};

// Packs iv + authTag + ciphertext into one hex string so a single column
// can store the result — nothing about the shape needs to be queryable.
const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("hex");
};

const decrypt = (packed) => {
  const buf = Buffer.from(packed, "hex");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

module.exports = { encrypt, decrypt };
