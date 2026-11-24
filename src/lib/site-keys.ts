/**
 * Client-safe definitions for website installation keys. Secrets are never stored:
 * only a SHA-256 hash plus a short display prefix.
 */
export const SITE_KEY_SCOPES = ["chat", "voice", "config"] as const;
export type SiteKeyScope = (typeof SITE_KEY_SCOPES)[number];
export type SiteKeyKind = "publishable" | "secret";

export const SCOPE_LABELS: Record<SiteKeyScope, string> = {
  chat: "Chat messages",
  voice: "Voice (speech in and out)",
  config: "Read public widget settings",
};

export type SiteKeyRecord = {
  id: string;
  label: string;
  kind: SiteKeyKind;
  scopes: SiteKeyScope[];
  prefix: string;
  hash: string;
  createdAt: string;
  createdBy: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  lastUsedAt: string | null;
  version: number;
};

/** Public view: never includes the hash. */
export type SiteKeyView = Omit<SiteKeyRecord, "hash">;

export type SiteKeyStore = {
  /** When true, browser widget requests must also carry a valid publishable key. */
  requireEmbedKey: boolean;
  keys: SiteKeyRecord[];
};

export const KEY_PREFIX: Record<SiteKeyKind, string> = { publishable: "ap_pk_", secret: "ap_sk_" };

export function kindOf(raw: string): SiteKeyKind | null {
  if (raw.startsWith(KEY_PREFIX.secret)) return "secret";
  if (raw.startsWith(KEY_PREFIX.publishable)) return "publishable";
  return null;
}

export function toView(k: SiteKeyRecord): SiteKeyView {
  const { hash: _hash, ...rest } = k;
  return rest;
}

export function normalizeStore(raw: unknown): SiteKeyStore {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const keys = Array.isArray(v["keys"]) ? (v["keys"] as SiteKeyRecord[]) : [];
  return {
    requireEmbedKey: v["requireEmbedKey"] === true,
    keys: keys
      .filter((k) => k && typeof k.hash === "string" && typeof k.id === "string")
      .map((k) => ({
        ...k,
        scopes: (k.scopes ?? []).filter((s): s is SiteKeyScope =>
          (SITE_KEY_SCOPES as readonly string[]).includes(s),
        ),
      })),
  };
}

export type KeyCheck =
  | { ok: true; key: SiteKeyRecord }
  | { ok: false; reason: "missing" | "malformed" | "unknown" | "revoked" | "scope" | "kind" };

/** Pure verification against an already-hashed candidate. */
export function checkKey(
  store: SiteKeyStore,
  candidateHash: string,
  kind: SiteKeyKind,
  scope: SiteKeyScope,
): KeyCheck {
  const key = store.keys.find((k) => k.hash === candidateHash);
  if (!key) return { ok: false, reason: "unknown" };
  if (key.kind !== kind) return { ok: false, reason: "kind" };
  if (key.revokedAt) return { ok: false, reason: "revoked" };
  if (!key.scopes.includes(scope)) return { ok: false, reason: "scope" };
  return { ok: true, key };
}
