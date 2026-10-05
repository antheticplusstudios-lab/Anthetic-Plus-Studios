import { createDecipheriv, createCipheriv, randomBytes } from "node:crypto";

function masterKey(): Buffer {
  const raw = process.env.ANTHETICPLUS_DB3_MASTER_KEY;
  if (!raw) throw new Error("Missing ANTHETICPLUS_DB3_MASTER_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ANTHETICPLUS_DB3_MASTER_KEY must be 32 bytes encoded as base64");
  return key;
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 28) throw new Error("Invalid ciphertext");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function assertServerOnlySecret(secret: string) {
  if (secret.length < 8) throw new Error("Secret is too short");
  if (/^sk_live_|^sk-[A-Za-z]/.test(secret) && process.env.NODE_ENV === "production") return;
}
