// Per-automation key rotation. Pure logic (no I/O) so it is unit-testable and shared by
// every automation's runtime. Each automation owns its own pool — pools never share state.

export type PoolScope =
  "ai_receptionist" | "workflow_automation" | "ai_sales_agent" | "message_ai" | "website_assistant";

export type PoolProvider = "llm" | "inworld" | "resend" | "twilio";

export type PoolKeyState = {
  id: string;
  label: string;
  enabled: boolean;
  /** epoch ms until which this key is resting after a limit error */
  cooldownUntil: number;
  uses: number;
  failures: number;
};

export type AttemptResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      kind: "limit" | "auth" | "transient" | "fatal";
      retryAfterMs?: number;
      message?: string;
    };

/** Classify a provider response so the pool knows whether to switch keys. */
export function classifyStatus(status: number): "limit" | "auth" | "transient" | "fatal" | "ok" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status === 402) return "limit";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500 || status === 408) return "transient";
  return "fatal";
}

export const DEFAULT_COOLDOWN_MS = 60_000;
export const AUTH_COOLDOWN_MS = 30 * 60_000;

/** Keys in the order to try now: healthy least-used first, resting keys last (soonest-ready first). */
export function orderPool(keys: PoolKeyState[], now: number): PoolKeyState[] {
  const live = keys.filter((k) => k.enabled);
  const ready = live.filter((k) => k.cooldownUntil <= now).sort((a, b) => a.uses - b.uses);
  const resting = live
    .filter((k) => k.cooldownUntil > now)
    .sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  return [...ready, ...resting];
}

export type PoolRunOutcome<T> = {
  value: T | null;
  usedKeyId: string | null;
  attempts: { keyId: string; kind: string }[];
  keys: PoolKeyState[];
  error?: string;
};

/**
 * Try keys in order until one succeeds. `payload` (e.g. the full conversation) is passed
 * unchanged to every attempt, so switching keys mid-conversation never loses history.
 * Returns the updated key states for the caller to persist.
 */
export async function runWithPool<P, T>(
  keys: PoolKeyState[],
  payload: P,
  attempt: (keyId: string, payload: P) => Promise<AttemptResult<T>>,
  now: () => number = Date.now,
): Promise<PoolRunOutcome<T>> {
  const state = keys.map((k) => ({ ...k }));
  const byId = new Map(state.map((k) => [k.id, k]));
  const attempts: { keyId: string; kind: string }[] = [];
  const order = orderPool(state, now()).filter((k) => k.cooldownUntil <= now());
  for (const k of order) {
    const res = await attempt(k.id, payload);
    const s = byId.get(k.id)!;
    if (res.ok) {
      s.uses += 1;
      attempts.push({ keyId: k.id, kind: "ok" });
      return { value: res.value, usedKeyId: k.id, attempts, keys: state };
    }
    s.failures += 1;
    attempts.push({ keyId: k.id, kind: res.kind });
    if (res.kind === "fatal") {
      return {
        value: null,
        usedKeyId: null,
        attempts,
        keys: state,
        error: res.message ?? "Request rejected",
      };
    }
    if (res.kind === "limit") s.cooldownUntil = now() + (res.retryAfterMs ?? DEFAULT_COOLDOWN_MS);
    if (res.kind === "auth") s.cooldownUntil = now() + AUTH_COOLDOWN_MS;
    if (res.kind === "transient") s.cooldownUntil = now() + 5_000;
  }
  return {
    value: null,
    usedKeyId: null,
    attempts,
    keys: state,
    error: order.length ? "All keys are at their limit right now" : "No keys are available",
  };
}
