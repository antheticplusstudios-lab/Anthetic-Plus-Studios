/**
 * Website installation keys, stored per site in DB1 platform_settings
 * (`website_agent_keys:<siteId>`). Only hashes are persisted.
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { db1Admin } from "@/server/db/clients.server";
import type { SiteId } from "@/assistant/sites/site-registry";
import {
  KEY_PREFIX,
  checkKey,
  kindOf,
  normalizeStore,
  type KeyCheck,
  type SiteKeyKind,
  type SiteKeyRecord,
  type SiteKeyScope,
  type SiteKeyStore,
} from "./site-keys";

const storeKey = (id: SiteId) => `website_agent_keys:${id}`;

export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function mintSecret(kind: SiteKeyKind): string {
  return `${KEY_PREFIX[kind]}${randomBytes(24).toString("base64url")}`;
}

export async function loadKeyStore(id: SiteId): Promise<SiteKeyStore> {
  const { data, error } = await db1Admin
    .from("platform_settings")
    .select("value")
    .eq("key", storeKey(id))
    .maybeSingle();
  if (error) throw new Error(`site keys: ${error.message}`);
  return normalizeStore(data?.value);
}

export async function saveKeyStore(id: SiteId, store: SiteKeyStore): Promise<void> {
  const { error } = await db1Admin
    .from("platform_settings")
    .upsert(
      { key: storeKey(id), value: store as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`site keys save: ${error.message}`);
}

export async function createKey(
  id: SiteId,
  input: { label: string; kind: SiteKeyKind; scopes: SiteKeyScope[] },
  userId: string,
): Promise<{ record: SiteKeyRecord; secret: string }> {
  const store = await loadKeyStore(id);
  const secret = mintSecret(input.kind);
  const record: SiteKeyRecord = {
    id: randomUUID(),
    label: input.label,
    kind: input.kind,
    scopes: input.scopes,
    prefix: secret.slice(0, 12),
    hash: hashKey(secret),
    createdAt: new Date().toISOString(),
    createdBy: userId,
    rotatedAt: null,
    revokedAt: null,
    revokeReason: null,
    lastUsedAt: null,
    version: 1,
  };
  store.keys.push(record);
  await saveKeyStore(id, store);
  return { record, secret };
}

export async function rotateKey(id: SiteId, keyId: string) {
  const store = await loadKeyStore(id);
  const k = store.keys.find((x) => x.id === keyId);
  if (!k) throw new Error("Key not found.");
  if (k.revokedAt) throw new Error("Revoked keys can't be rotated. Create a new key instead.");
  const secret = mintSecret(k.kind);
  k.hash = hashKey(secret);
  k.prefix = secret.slice(0, 12);
  k.rotatedAt = new Date().toISOString();
  k.version += 1;
  await saveKeyStore(id, store);
  return { record: k, secret };
}

export async function revokeKey(id: SiteId, keyId: string, reason: string) {
  const store = await loadKeyStore(id);
  const k = store.keys.find((x) => x.id === keyId);
  if (!k) throw new Error("Key not found.");
  if (!k.revokedAt) {
    k.revokedAt = new Date().toISOString();
    k.revokeReason = reason;
    await saveKeyStore(id, store);
  }
  return k;
}

/** Verifies a raw key for a site and scope. Never logs the raw value. */
export async function verifyRawKey(
  id: SiteId,
  raw: string | null,
  scope: SiteKeyScope,
): Promise<KeyCheck> {
  if (!raw) return { ok: false, reason: "missing" };
  const kind = kindOf(raw);
  if (!kind || raw.length > 120) return { ok: false, reason: "malformed" };
  const store = await loadKeyStore(id);
  return checkKey(store, hashKey(raw), kind, scope);
}

/** Records last use at most every 10 minutes to avoid write amplification. */
export async function touchKey(id: SiteId, keyId: string) {
  const store = await loadKeyStore(id);
  const k = store.keys.find((x) => x.id === keyId);
  if (!k) return;
  if (k.lastUsedAt && Date.now() - Date.parse(k.lastUsedAt) < 600_000) return;
  k.lastUsedAt = new Date().toISOString();
  await saveKeyStore(id, store).catch(() => undefined);
}
