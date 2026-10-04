import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPage, EmptyState, Loading, Panel, StatCard, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAutomations, runDiagnostics } from "@/lib/command-center.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/automations/")({
  head: () => ({
    meta: [
      { title: "Automation Fleet — AntheticPlus Control Center" },
      { name: "description", content: "Every deployed AntheticPlus automation with live runtime state, health, usage and renewal." },
      { property: "og:title", content: "Automation Fleet — AntheticPlus Control Center" },
      { property: "og:description", content: "Every deployed AntheticPlus automation with live runtime state, health, usage and renewal." },
    ],
  }),
  component: FleetPage,
});

type Automation = Awaited<ReturnType<typeof listAutomations>>["automations"][number];

const HEALTH_TONE: Record<string, string> = {
  HEALTHY: "border-success/40 text-success",
  DEGRADED: "border-foreground/30 text-foreground",
  WARNING: "border-foreground/30 text-foreground",
  ERROR: "border-destructive/50 text-destructive",
  OFFLINE: "border-destructive/50 text-destructive",
  SUSPENDED: "border-destructive/50 text-destructive",
  UNCHECKED: "border-border text-muted-foreground",
};

function Tag({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

function AutomationCard({ a }: { a: Automation }) {
  return (
    <Link
      to="/admin/automations/$id"
      params={{ id: a.id }}
      className="card-premium block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/25"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold capitalize">{a.type.replace(/_/g, " ")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {a.company || a.clientName || "Unnamed client"} · {a.clientId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className={HEALTH_TONE[a.health] ?? HEALTH_TONE["UNCHECKED"]}>{a.health}</Tag>
          <Tag className={a.runtime === "active" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}>
            {a.runtime || a.runState}
          </Tag>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Domain</dt>
          <dd className="truncate font-semibold">{a.domain || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Signup origin</dt>
          <dd className="truncate font-semibold">{a.origin.label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Installation</dt>
          <dd className="font-semibold">
            {a.requiresReinstallation ? "Reinstall required" : a.installed ? "Installed" : "Not installed"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Channels</dt>
          <dd className="truncate font-semibold">{a.channels.length ? a.channels.join(", ") : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tokens (month)</dt>
          <dd className="font-semibold tabular-nums">{a.tokens.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Renewal</dt>
          <dd className="font-semibold">
            {a.expiresAt ? `${new Date(a.expiresAt).toLocaleDateString()} (${a.daysRemaining}d)` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="truncate font-semibold">{a.phone || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last activity</dt>
          <dd className="font-semibold">{a.lastActivity ? timeAgo(a.lastActivity) : "never"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">AI errors (24h)</dt>
          <dd className={cn("font-semibold tabular-nums", a.providerFailures > 0 && "text-destructive")}>{a.providerFailures}</dd>
        </div>
      </dl>

      {(a.healthSummary || a.integrationFailure) && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
          {a.integrationFailure ? "Integration not connected. " : ""}
          {a.healthSummary}
          {a.healthCheckedAt ? ` · checked ${timeAgo(a.healthCheckedAt)}` : " · never checked"}
        </p>
      )}
    </Link>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "attention", label: "Needs attention" },
  { key: "expiring", label: "Expiring ≤14d" },
  { key: "uninstalled", label: "Not installed" },
] as const;

function FleetPage() {
  const qc = useQueryClient();
  const diagnose = useServerFn(runDiagnostics);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [running, setRunning] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cc", "automations"],
    queryFn: () => listAutomations(),
  });

  const list = useMemo(() => {
    const all = data?.automations ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((a) => {
      if (needle) {
        const hay = `${a.type} ${a.domain} ${a.company} ${a.clientName} ${a.clientId} ${a.phone ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filter === "running") return a.runtime === "active";
      if (filter === "attention")
        return ["ERROR", "OFFLINE", "SUSPENDED", "WARNING", "DEGRADED"].includes(a.health) || a.providerFailures > 0 || a.integrationFailure;
      if (filter === "expiring") return a.daysRemaining !== null && a.daysRemaining <= 14;
      if (filter === "uninstalled") return !a.installed || a.requiresReinstallation;
      return true;
    });
  }, [data, filter, q]);

  if (isLoading) return <Loading label="Loading fleet" />;
  if (error) return <Panel title="Fleet unavailable">{(error as Error).message}</Panel>;

  const all = data?.automations ?? [];
  const runDiag = async () => {
    setRunning(true);
    try {
      const r = await diagnose({ data: {} });
      toast.success(`Diagnostics finished for ${r.checks} automation(s)`);
      await qc.invalidateQueries({ queryKey: ["cc", "automations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AdminPage
      title="Automation Fleet"
      subtitle="Every Gen 2 automation with its client, runtime eligibility, real health checks, usage and renewal. Open one for full control."
      actions={
        <Button onClick={() => void runDiag()} disabled={running}>
          {running ? "Running checks…" : "Run health checks"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Automations" value={all.length} />
        <StatCard label="Running" value={all.filter((a) => a.runtime === "active").length} tone="good" />
        <StatCard
          label="Needs attention"
          value={all.filter((a) => ["ERROR", "OFFLINE", "SUSPENDED"].includes(a.health) || a.providerFailures > 0).length}
          tone="bad"
        />
        <StatCard label="Not installed" value={all.filter((a) => !a.installed || a.requiresReinstallation).length} tone="warn" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search client, company, domain, phone…"
          className="sm:max-w-xs"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No automations match"
          description={all.length ? "Try a different filter or search." : "Automations appear here once an order is approved."}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((a) => (
            <AutomationCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </AdminPage>
  );
}
