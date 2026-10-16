/* eslint-disable @typescript-eslint/no-explicit-any -- admin views read loosely-typed rows joined across DB2/DB3/DB4; validated server-side with zod on write. */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AdminPage,
  EmptyState,
  Loading,
  Panel,
  StatCard,
  StatusPill,
  timeAgo,
  shortDate,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { automations, SLUG_BY_ENGINE_KIND, type EngineKind } from "@/lib/automations";
import { CONFIG_FIELDS } from "@/lib/automation-config";
import {
  STRATEGY_COPY,
  parsePool,
  movePoolMember,
  type PoolStrategy,
  type ProviderPool,
} from "@/lib/provider-pool";
import { PoolDiagram } from "@/components/pool-diagram";
import {
  executionAction,
  getControlRoom,
  queueTestExecution,
  saveDeploymentConfig,
  setDeploymentState,
  testProviderKey,
} from "@/lib/automation-control.functions";

const PROVIDERS = ["groq", "openrouter", "openai", "anthropic"] as const;

export function AutomationControlRoom({ kind }: { kind: EngineKind }) {
  const product = automations.find((a) => a.slug === SLUG_BY_ENGINE_KIND[kind])!;
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "90d">("7d");
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["control-room", kind, range],
    queryFn: () => getControlRoom({ data: { kind, range } }),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["control-room", kind] });

  if (q.isLoading) return <Loading label={`Loading ${product.name}`} />;
  if (q.error) return <Panel title="Control room unavailable">{(q.error as Error).message}</Panel>;
  const d = q.data!;
  const dep = d.deployments.find((x) => x.id === selected) ?? null;

  return (
    <AdminPage
      title={product.name}
      subtitle={`Control room for every ${product.shortName} deployment. All numbers come from live records.`}
      actions={
        <Button variant="outline" asChild>
          <Link to="/admin/automations">All automations</Link>
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(["24h", "7d", "30d", "90d"] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={range === r ? "default" : "outline"}
            onClick={() => setRange(r)}
          >
            {r}
          </Button>
        ))}
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {[
            "overview",
            "clients",
            "configuration",
            "providers",
            "analytics",
            "executions",
            "health",
          ].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t === "providers" ? "Provider pool" : t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active clients" value={d.counts.active} tone="good" />
            <StatCard
              label="Deployments"
              value={d.counts.total}
              hint={`${d.counts.testing} testing · ${d.counts.paused} paused · ${d.counts.expired} expired`}
            />
            <StatCard
              label={`Executions (${range})`}
              value={d.stats.executions}
              hint={`${d.stats.failed} failed`}
              tone={d.stats.failed ? "bad" : "neutral"}
            />
            <StatCard
              label="Success rate"
              value={d.stats.successRate === null ? "No data yet" : `${d.stats.successRate}%`}
              hint={
                d.stats.avgDurationMs === null ? "No data yet" : `avg ${d.stats.avgDurationMs} ms`
              }
            />
          </div>
          <ProviderUsage providers={d.stats.providers} />
        </TabsContent>

        <TabsContent value="clients">
          <Panel title="Clients" description="Click a client to configure its deployment.">
            {d.deployments.length === 0 ? (
              <EmptyState
                title="No deployments yet"
                description="A deployment is created when an order for this automation is approved."
              />
            ) : (
              <div className="divide-y divide-border">
                {d.deployments.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setSelected(x.id)}
                    className={`grid w-full gap-1 py-3 text-left text-sm sm:grid-cols-6 ${selected === x.id ? "text-primary" : ""}`}
                  >
                    <span className="truncate font-semibold sm:col-span-2">
                      {x.client}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {x.domain || "—"}
                      </span>
                    </span>
                    <span>
                      <StatusPill status={x.state ?? "unknown"} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Activated {shortDate(x.activatedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Last run {x.lastExecution ? timeAgo(x.lastExecution) : "never"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Expires {shortDate(x.expiresAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="configuration">
          {dep ? (
            <DeploymentConfig kind={kind} dep={dep} onSaved={refresh} />
          ) : (
            <EmptyState
              title="Pick a client"
              description="Open the Clients tab and select a deployment to configure it."
            />
          )}
        </TabsContent>

        <TabsContent value="providers">
          {dep ? (
            <PoolEditor dep={dep} keys={d.keys} onSaved={refresh} />
          ) : (
            <EmptyState
              title="Pick a client"
              description="Provider pools are set per deployment. Select one in the Clients tab."
            />
          )}
          <KeyHealth keys={d.keys} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Executions" value={d.stats.executions} />
            <StatCard
              label="Failure rate"
              value={d.stats.failureRate === null ? "No data yet" : `${d.stats.failureRate}%`}
            />
            <StatCard
              label="Avg duration"
              value={d.stats.avgDurationMs === null ? "No data yet" : `${d.stats.avgDurationMs} ms`}
            />
            <StatCard label="AI tokens used" value={d.stats.tokens.toLocaleString()} />
          </div>
          <ProviderUsage providers={d.stats.providers} />
          <Panel title="Top failure reasons">
            {d.stats.topFailures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failures in this period.</p>
            ) : (
              d.stats.topFailures.map((f) => (
                <p key={f.reason} className="text-sm">
                  <b>{f.count}×</b> {f.reason}
                </p>
              ))
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="executions">
          <Executions rows={d.executions} onChanged={refresh} />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Queue waiting"
              value={d.queue.pending}
              hint={d.queue.oldestPending ? `oldest ${timeAgo(d.queue.oldestPending)}` : "empty"}
            />
            <StatCard label="Running now" value={d.queue.running} />
            <StatCard
              label="Providers cooling down"
              value={d.keys.filter((k) => k.coolingDown).length}
              tone={d.keys.some((k) => k.coolingDown) ? "warn" : "good"}
            />
          </div>
          <Panel title="Deployment health">
            {d.deployments.map((x) => (
              <p key={x.id} className="text-sm">
                <b>{x.client}</b> — last success {x.lastSuccess ? timeAgo(x.lastSuccess) : "never"}
                {x.lastError ? ` · last error: ${x.lastError}` : ""}
              </p>
            ))}
            {!d.deployments.length && (
              <p className="text-sm text-muted-foreground">No deployments yet.</p>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function ProviderUsage({
  providers,
}: {
  providers: { provider: string; requests: number; errors: number; avgLatencyMs: number }[];
}) {
  const total = providers.reduce((s, p) => s + p.requests, 0);
  return (
    <Panel title="Provider usage" description="Which AI provider answered requests in this period.">
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        providers.map((p) => (
          <div key={p.provider} className="mb-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold capitalize">{p.provider}</span>
              <span>
                {p.requests} req · {p.errors} errors · {p.avgLatencyMs} ms
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${(p.requests / total) * 100}%` }}
              />
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

function DeploymentConfig({
  kind,
  dep,
  onSaved,
}: {
  kind: EngineKind;
  dep: any;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<Record<string, any>>(() => ({
    ...(dep.config?.settings ?? {}),
  }));
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveDeploymentConfig);
  const setState = useServerFn(setDeploymentState);
  const test = useServerFn(queueTestExecution);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Panel
        title={`${dep.client} — ${dep.state}`}
        description="State changes take effect on the next execution."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || dep.state === "active"}
            onClick={() =>
              run(() => setState({ data: { automationId: dep.id, state: "active" } }), "Activated")
            }
          >
            Activate
          </Button>
          <Button
            variant="outline"
            disabled={busy || dep.state === "testing"}
            onClick={() =>
              run(
                () => setState({ data: { automationId: dep.id, state: "testing" } }),
                "Testing mode on — only test runs execute",
              )
            }
          >
            Testing mode
          </Button>
          <Button
            variant="outline"
            disabled={busy || dep.state === "paused"}
            onClick={() =>
              run(
                () => setState({ data: { automationId: dep.id, state: "paused" } }),
                "Paused — new work will not run",
              )
            }
          >
            Pause
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(
                () => test({ data: { automationId: dep.id, input: sampleInput(kind) } }),
                "Test run queued — see Executions",
              )
            }
          >
            Queue test run
          </Button>
        </div>
      </Panel>
      <Panel title="Configuration">
        <div className="grid gap-4 md:grid-cols-2">
          {CONFIG_FIELDS[kind].map((f) => (
            <label key={f.key} className={f.long ? "md:col-span-2" : ""}>
              <span className="text-sm font-semibold">{f.label}</span>
              {f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}
              {f.long ? (
                <Textarea
                  className="mt-1"
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                />
              ) : (
                <Input
                  className="mt-1"
                  type={f.kind === "number" ? "number" : "text"}
                  value={vals[f.key] ?? ""}
                  onChange={(e) =>
                    setVals({
                      ...vals,
                      [f.key]: f.kind === "number" ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
        </div>
        <Button
          className="mt-4"
          disabled={busy}
          onClick={() =>
            run(() => save({ data: { automationId: dep.id, settings: vals } }), "Saved")
          }
        >
          Save configuration
        </Button>
      </Panel>
    </div>
  );
}

function sampleInput(kind: EngineKind): Record<string, string> {
  if (kind === "ai_receptionist")
    return { channel: "sms", from: "+10000000000", body: "Hi, are you open tomorrow?" };
  if (kind === "lead_capture")
    return {
      name: "Test Lead",
      email: "test@example.com",
      message: "Looking for a quote, budget ready this month",
    };
  if (kind === "kb_support") return { question: "What are your opening hours?" };
  return { platform: "instagram", sender_id: "test-user", text: "How much is your service?" };
}

function PoolEditor({ dep, keys, onSaved }: { dep: any; keys: any[]; onSaved: () => void }) {
  const initial: ProviderPool = parsePool(dep.config?.provider_pool) ?? {
    strategy: "priority",
    members: PROVIDERS.map((p, i) => ({
      provider: p,
      enabled: keys.some((k) => k.provider_key === p && k.is_active),
      weight: 25,
      priority: i + 1,
      model: null,
    })),
  };
  const [pool, setPool] = useState<ProviderPool>(initial);
  const save = useServerFn(saveDeploymentConfig);
  const enabled = pool.members.filter((m) => m.enabled);
  const totalW = enabled.reduce((s, m) => s + (m.weight ?? 0), 0) || 1;
  const order = useMemo(
    () => [...enabled].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    [enabled],
  );
  const upd = (i: number, patch: Partial<ProviderPool["members"][number]>) =>
    setPool({ ...pool, members: pool.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <Panel
      title="How should AI requests be distributed?"
      description={`Applies to ${dep.client}. Provider keys stay encrypted on the server.`}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(STRATEGY_COPY) as PoolStrategy[]).map((s) => (
          <button
            key={s}
            onClick={() => setPool({ ...pool, strategy: s })}
            className={`rounded-xl border p-4 text-left ${pool.strategy === s ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <p className="font-semibold">{STRATEGY_COPY[s].title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{STRATEGY_COPY[s].body}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm">
        <PoolDiagram pool={pool} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {enabled.length} provider(s) on · order {order.map((m) => m.provider).join(", ") || "—"}
        </p>
      </div>
      <div className="mt-4 space-y-2">
        {[...pool.members]
          .map((m, i) => ({ m, i }))
          .sort((a, b) => (a.m.priority ?? 0) - (b.m.priority ?? 0))
          .map(({ m, i }) => {
            const hasKey = keys.some((k) => k.provider_key === m.provider && k.is_active);
            return (
              <div
                key={m.provider}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm"
              >
                <span className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${m.provider} up`}
                    className="text-xs leading-none text-muted-foreground hover:text-foreground"
                    onClick={() => setPool(movePoolMember(pool, m.provider, -1))}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${m.provider} down`}
                    className="text-xs leading-none text-muted-foreground hover:text-foreground"
                    onClick={() => setPool(movePoolMember(pool, m.provider, 1))}
                  >
                    ▼
                  </button>
                </span>
                <Switch
                  checked={m.enabled}
                  onCheckedChange={(v) => upd(i, { enabled: v })}
                  aria-label={`Enable ${m.provider}`}
                />
                <span className="w-24 font-semibold capitalize">{m.provider}</span>
                {!hasKey && <span className="text-xs text-destructive">no active key</span>}
                <label className="flex items-center gap-1 text-xs">
                  Order
                  <Input
                    className="w-16"
                    type="number"
                    min={1}
                    value={m.priority}
                    onChange={(e) => upd(i, { priority: Number(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs">
                  Share
                  <Input
                    className="w-16"
                    type="number"
                    min={0}
                    value={m.weight}
                    onChange={(e) => upd(i, { weight: Number(e.target.value) })}
                  />
                </label>
                <Input
                  className="w-48"
                  placeholder="model (optional)"
                  value={m.model ?? ""}
                  onChange={(e) => upd(i, { model: e.target.value || null })}
                />
              </div>
            );
          })}
      </div>
      <Button
        className="mt-4"
        onClick={async () => {
          try {
            await save({ data: { automationId: dep.id, pool: pool as any } });
            toast.success("Provider pool saved");
            onSaved();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Save provider pool
      </Button>
    </Panel>
  );
}

function KeyHealth({ keys }: { keys: any[] }) {
  const test = useServerFn(testProviderKey);
  return (
    <Panel
      title="Provider keys"
      description="Add, rotate or remove keys under AI Infrastructure → LLM keys."
      className="mt-4"
    >
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No provider keys configured.</p>
      ) : (
        keys.map((k) => (
          <div
            key={k.id}
            className="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm last:border-0"
          >
            <span className="w-40 truncate font-semibold">
              {k.label}{" "}
              <span className="text-xs capitalize text-muted-foreground">{k.provider_key}</span>
            </span>
            <StatusPill
              status={!k.is_active ? "disabled" : k.coolingDown ? "cooling down" : "healthy"}
            />
            <span className="text-xs text-muted-foreground">
              {k.request_count} ok · {k.error_count} errors · used{" "}
              {k.last_used_at ? timeAgo(k.last_used_at) : "never"}
            </span>
            {k.last_error && (
              <span className="max-w-xs truncate text-xs text-destructive">{k.last_error}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={async () => {
                const r = await test({ data: { keyId: k.id } }).catch((e) => ({
                  ok: false,
                  latencyMs: 0,
                  model: String(e.message),
                }));
                if (r.ok) toast.success(`Working · ${r.latencyMs} ms · ${r.model}`);
                else toast.error("Provider test failed");
              }}
            >
              Test
            </Button>
          </div>
        ))
      )}
    </Panel>
  );
}

function Executions({ rows, onChanged }: { rows: any[]; onChanged: () => void }) {
  const act = useServerFn(executionAction);
  if (!rows.length)
    return (
      <EmptyState
        title="No executions in this period"
        description="Runs appear here as soon as events arrive or a test run is queued."
      />
    );
  return (
    <Panel title="Executions">
      <div className="divide-y divide-border">
        {rows.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <code className="text-xs text-muted-foreground">{e.id.slice(0, 8)}</code>
            <StatusPill status={e.status} />
            <span className="text-xs">
              {e.trigger} · attempts {e.attempts} · {timeAgo(e.queuedAt)}
              {e.durationMs !== null ? ` · ${e.durationMs} ms` : ""}
            </span>
            {e.error && (
              <span className="max-w-md truncate text-xs text-destructive">{e.error}</span>
            )}
            <span className="ml-auto flex gap-2">
              {["queued", "retrying", "running"].includes(e.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await act({ data: { executionId: e.id, action: "cancel" } });
                      toast.success("Cancelled");
                      onChanged();
                    } catch (x) {
                      toast.error((x as Error).message);
                    }
                  }}
                >
                  Cancel
                </Button>
              )}
              {["failed", "cancelled", "paused", "disabled"].includes(e.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await act({ data: { executionId: e.id, action: "retry" } });
                      toast.success("Re-queued");
                      onChanged();
                    } catch (x) {
                      toast.error((x as Error).message);
                    }
                  }}
                >
                  Retry
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
