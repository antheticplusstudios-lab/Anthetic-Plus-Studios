import type { ProviderPool } from "@/lib/provider-pool";
import { poolShares } from "@/lib/provider-pool";

/** Visual explanation of a provider pool for non-technical admins. Pure presentation of the saved pool. */
export function PoolDiagram({ pool }: { pool: ProviderPool }) {
  const enabled = pool.members.filter((m) => m.enabled);
  if (!enabled.length)
    return <p className="text-sm text-muted-foreground">Turn on at least one provider below.</p>;
  const ordered = [...enabled].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const chip = (p: string, sub?: string) => (
    <span className="inline-flex flex-col items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold capitalize shadow-sm">
      {p}
      {sub && (
        <span className="mt-0.5 text-[10px] font-normal normal-case text-muted-foreground">
          {sub}
        </span>
      )}
    </span>
  );
  if (pool.strategy === "balanced")
    return (
      <div aria-label="Balanced rotation diagram" className="flex flex-wrap items-center gap-2">
        {ordered.map((m) => (
          <span key={m.provider} className="flex items-center gap-2">
            {chip(m.provider)}
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          back to {ordered[0]!.provider} (↻ evenly shared)
        </span>
      </div>
    );
  if (pool.strategy === "weighted") {
    const shares = poolShares(pool);
    return (
      <div aria-label="Weighted distribution diagram" className="space-y-2">
        <div className="flex h-6 w-full overflow-hidden rounded-full border border-border">
          {shares.map((s, i) => (
            <div
              key={s.provider}
              className={
                i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-primary/60" : "bg-primary/30"
              }
              style={{ width: `${s.percent}%` }}
              title={`${s.provider} ${s.percent}%`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {shares.map((s) => (
            <span key={s.provider} className="capitalize">
              <b>{s.provider}</b> {s.percent}%
            </span>
          ))}
        </div>
      </div>
    );
  }
  const names = ["Primary", "Backup", "Emergency backup"];
  return (
    <div aria-label="Priority and fallback diagram" className="flex flex-wrap items-center gap-2">
      {ordered.map((m, i) => (
        <span key={m.provider} className="flex items-center gap-2">
          {chip(m.provider, names[i] ?? `Fallback ${i + 1}`)}
          {i < ordered.length - 1 && (
            <span className="text-xs text-muted-foreground">if it fails →</span>
          )}
        </span>
      ))}
    </div>
  );
}
