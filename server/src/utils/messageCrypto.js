const crypto = require("crypto");

const ENCRYPTION_PREFIX = "enc:v1";
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey = undefined;
let warnedMissingKey = false;
let warnedInvalidKey = false;

function normalizeKey(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.length === KEY_BYTES) {
    return decoded;
  }

  throw new Error(
    "Invalid MESSAGE_ENCRYPTION_KEY. Expected 32-byte key in base64 or 64-char hex."
  );
}

function getKey() {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) {
    if (!warnedMissingKey && process.env.NODE_ENV !== "test") {
      console.warn(
        "[message-crypto] MESSAGE_ENCRYPTION_KEY is not set. Message encryption is disabled."
      );
      warnedMissingKey = true;
    }
    cachedKey = null;
    return cachedKey;
  }
  try {
    cachedKey = normalizeKey(raw);
  } catch (err) {
    if (!warnedInvalidKey) {
      console.error(
        `[message-crypto] ${err.message}. Message encryption will be disabled.`
      );
      warnedInvalidKey = true;
    }
    cachedKey = null;
  }
  return cachedKey;
}

function isEncryptionEnabled() {
  return !!getKey();
}

function isEncryptedText(value) {
  return typeof value === "string" && value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

function encryptText(value) {
  const plain = String(value || "");
  if (!plain) return "";
  if (isEncryptedText(plain)) return plain;

  const key = getKey();
  if (!key) return plain;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptText(value) {
  const text = String(value || "");
  if (!text) return "";
  if (!isEncryptedText(text)) return text;

  const key = getKey();
  if (!key) return "";

  const parts = text.split(":");
  if (parts.length !== 5) return "";

  try {
    const iv = Buffer.from(parts[2], "base64");
    const authTag = Buffer.from(parts[3], "base64");
    const encrypted = Buffer.from(parts[4], "base64");

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      return "";
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

module.exports = {
  decryptText,
  encryptText,
  isEncryptedText,
  isEncryptionEnabled,
};
