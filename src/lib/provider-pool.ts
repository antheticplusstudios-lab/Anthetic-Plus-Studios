// Pure provider-pool ordering. No secrets, no I/O — safe to unit test and to import anywhere.
// The router tries keys in the returned order; a failing key is put on cooldown and the next is tried.

export type PoolStrategy = "balanced" | "weighted" | "priority";

export type PoolMember = {
  provider: string;
  enabled: boolean;
  weight?: number;
  priority?: number;
  model?: string | null;
};
export type ProviderPool = { strategy: PoolStrategy; members: PoolMember[] };

export type PoolKey = { id: string; provider_key: string; priority: number; request_count: number };

export const STRATEGY_COPY: Record<PoolStrategy, { title: string; body: string }> = {
  balanced: {
    title: "Balanced rotation",
    body: "Each request goes to the next healthy provider, so work is shared evenly.",
  },
  weighted: {
    title: "Weighted distribution",
    body: "Providers with a bigger share get proportionally more requests while all are healthy.",
  },
  priority: {
    title: "Priority + fallback",
    body: "Always try #1 first. If it is unavailable, automatically use #2, then #3.",
  },
};

export function parsePool(raw: unknown): ProviderPool | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const strategy = (["balanced", "weighted", "priority"] as const).find((s) => s === r["strategy"]);
  if (!strategy || !Array.isArray(r["members"])) return null;
  const members = (r["members"] as unknown[]).flatMap((m) => {
    const x = (m ?? {}) as Record<string, unknown>;
    return typeof x["provider"] === "string"
      ? [
          {
            provider: x["provider"] as string,
            enabled: x["enabled"] !== false,
            weight: Number(x["weight"] ?? 1),
            priority: Number(x["priority"] ?? 100),
            model: (x["model"] as string) ?? null,
          },
        ]
      : [];
  });
  return { strategy, members };
}

/** Returns keys in the order they should be attempted. `rand` is injectable for tests. */
export function orderKeys<K extends PoolKey>(
  keys: K[],
  pool: ProviderPool | null,
  rand: () => number = Math.random,
): K[] {
  if (!pool) return [...keys].sort((a, b) => a.priority - b.priority);
  const members = new Map(pool.members.filter((m) => m.enabled).map((m) => [m.provider, m]));
  const allowed = keys.filter((k) => members.has(k.provider_key));
  if (pool.strategy === "priority") {
    return allowed.sort(
      (a, b) =>
        (members.get(a.provider_key)!.priority ?? 100) -
          (members.get(b.provider_key)!.priority ?? 100) || a.priority - b.priority,
    );
  }
  if (pool.strategy === "balanced") {
    // Persistent rotation: the least-used healthy key goes first (request_count lives in DB3).
    return allowed.sort((a, b) => a.request_count - b.request_count || a.priority - b.priority);
  }
  // weighted: sample without replacement proportional to weight; remaining keys become fallbacks.
  const pool2 = [...allowed];
  const out: K[] = [];
  while (pool2.length) {
    const total = pool2.reduce(
      (s, k) => s + Math.max(0, members.get(k.provider_key)!.weight ?? 1),
      0,
    );
    let r = rand() * (total || 1);
    let idx = pool2.findIndex(
      (k) => (r -= Math.max(0, members.get(k.provider_key)!.weight ?? 1)) < 0,
    );
    if (idx < 0) idx = 0;
    out.push(pool2.splice(idx, 1)[0]!);
  }
  return out;
}

export function modelFor(pool: ProviderPool | null, provider: string) {
  return pool?.members.find((m) => m.provider === provider)?.model || null;
}

/** Percentage share per enabled member for the weighted strategy (rounded, sums to ~100). */
export function poolShares(pool: ProviderPool) {
  const enabled = pool.members.filter((m) => m.enabled);
  const total = enabled.reduce((s, m) => s + Math.max(0, m.weight ?? 0), 0);
  return enabled.map((m) => ({
    provider: m.provider,
    percent: total ? Math.round((Math.max(0, m.weight ?? 0) / total) * 100) : 0,
  }));
}

/** Moves a member up (-1) or down (+1) and renumbers priorities 1..n. */
export function movePoolMember(pool: ProviderPool, provider: string, dir: -1 | 1): ProviderPool {
  const sorted = [...pool.members].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const i = sorted.findIndex((m) => m.provider === provider);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return pool;
  [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  return { ...pool, members: sorted.map((m, k) => ({ ...m, priority: k + 1 })) };
}
