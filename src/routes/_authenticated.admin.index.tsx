import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Ban, KeyRound, TimerReset, UserCheck } from "lucide-react";
import { Loading, Panel, StatCard, money, timeAgo } from "@/components/admin-ui";
import {
  useAllInstances,
  useAllPayments,
  useAuditLog,
  useFailoverLog,
  useGroqKeys,
} from "@/hooks/use-admin";
import { daysRemaining, isLive } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminCommandCenter,
});

type AnyRow = any;

function AdminCommandCenter() {
  const { data: payments = [], isLoading: paymentsLoading } = useAllPayments();
  const { data: instances = [], isLoading: instancesLoading } = useAllInstances();
  const { data: groqKeys = [], isLoading: keysLoading } = useGroqKeys();
  const { data: failoverLog = [], isLoading: failoverLoading } = useFailoverLog();
  const { data: auditLog = [], isLoading: auditLoading } = useAuditLog();

  if (paymentsLoading || instancesLoading || keysLoading || failoverLoading || auditLoading) return <Loading />;

  const approved = payments.filter((p: AnyRow) => p.status === "approved");
  const mrr = approved.reduce((sum: number, p: AnyRow) => {
    const amount = Number(p.amount ?? 0);
    return sum + (p.billing_plan === "yearly" ? amount / 12 : amount);
  }, 0);

  const activeAutomations = instances.filter((i: AnyRow) => isLive(i)).length;
  const leadsCaptured = instances.reduce((s: number, i: AnyRow) => s + Number(i.leads_count ?? 0), 0);
  const conversationsHandled = instances.reduce((s: number, i: AnyRow) => s + Number(i.conversations_count ?? 0), 0);

  const originCounts = new Map<string, number>();
  for (const p of payments as AnyRow[]) {
    const origin = p.origin || "unknown";
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
  }
  const totalPayments = payments.length || 1;

  const enabledKeys = groqKeys.filter((k: AnyRow) => k.enabled);
  const primaryKey = groqKeys.find((k: AnyRow) => k.is_primary);
  const cooldownKeys = groqKeys.filter((k: AnyRow) => k.cooldown_until && new Date(k.cooldown_until).getTime() > Date.now());
  const recentFailover = [...failoverLog]
    .sort((a: AnyRow, b: AnyRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const pendingPayments = payments.filter((p: AnyRow) => p.status === "pending");
  const expiringSoon = instances.filter((i: AnyRow) => {
    const d = daysRemaining(i.expires_at);
    return (i.status === "paid" || i.status === "active") && d <= 5 && d > 0;
  });
  const stoppedRevoked = instances.filter((i: AnyRow) => i.status === "stopped" || i.status === "revoked");
  const awaitingSetup = instances.filter((i: AnyRow) => i.status === "paid" && !i.client_id);

  const recentAudit = [...auditLog]
    .sort((a: AnyRow, b: AnyRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const urgentItems: { icon: React.ReactNode; text: string; to: string }[] = [];
  if (pendingPayments.length)
    urgentItems.push({
      icon: <AlertTriangle className="h-4 w-4 text-foreground" />,
      text: `${pendingPayments.length} payment${pendingPayments.length === 1 ? "" : "s"} awaiting verification`,
      to: "/admin/verification",
    });
  if (expiringSoon.length)
    urgentItems.push({
      icon: <TimerReset className="h-4 w-4 text-foreground" />,
      text: `${expiringSoon.length} automation${expiringSoon.length === 1 ? "" : "s"} expiring within 5 days`,
      to: "/admin/automations",
    });
  if (stoppedRevoked.length)
    urgentItems.push({
      icon: <Ban className="h-4 w-4 text-destructive" />,
      text: `${stoppedRevoked.length} automation${stoppedRevoked.length === 1 ? "" : "s"} stopped or revoked`,
      to: "/admin/automations",
    });
  if (cooldownKeys.length)
    urgentItems.push({
      icon: <KeyRound className="h-4 w-4 text-destructive" />,
      text: `${cooldownKeys.length} Groq key${cooldownKeys.length === 1 ? "" : "s"} in cooldown`,
      to: "/admin/infrastructure",
    });
  if (awaitingSetup.length)
    urgentItems.push({
      icon: <UserCheck className="h-4 w-4 text-foreground" />,
      text: `${awaitingSetup.length} instance${awaitingSetup.length === 1 ? "" : "s"} paid but awaiting setup`,
      to: "/admin/creator",
    });

  return (
    <div className="page-enter space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Global Command Center</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Is the business healthy and what needs me right now.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value={money(mrr)} hint="Normalized monthly, approved payments" />
        <StatCard label="Active automations" value={activeAutomations} tone="good" />
        <StatCard label="Leads captured" value={leadsCaptured.toLocaleString()} />
        <StatCard label="Conversations handled" value={conversationsHandled.toLocaleString()} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Attribution split" description="Where payments originate">
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {[...originCounts.entries()].map(([origin, count]) => {
                const pct = Math.round((count / totalPayments) * 100);
                return (
                  <div key={origin}>
                    <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <span>{origin}</span>
                      <span className="tabular-nums">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Infrastructure pulse" description="Groq pool health & recent failovers">
          {groqKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Groq keys configured.{" "}
              <Link to="/admin/infrastructure" className="font-bold text-primary underline">
                Add keys in Infrastructure
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-lg font-extrabold tabular-nums">{groqKeys.length}</p>
                  <p className="text-xs text-muted-foreground">Total keys</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-lg font-extrabold tabular-nums">{enabledKeys.length}</p>
                  <p className="text-xs text-muted-foreground">Enabled</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="truncate text-sm font-extrabold">{primaryKey?.label ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">Primary</p>
                </div>
              </div>
              {cooldownKeys.length > 0 && (
                <p className="text-xs font-semibold text-destructive">
                  {cooldownKeys.length} key(s) in cooldown until{" "}
                  {cooldownKeys.map((k: AnyRow) => new Date(k.cooldown_until).toLocaleTimeString()).join(", ")}
                </p>
              )}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Recent failovers</p>
                {recentFailover.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No failover events.</p>
                ) : (
                  <ul className="space-y-2">
                    {recentFailover.map((f: AnyRow) => (
                      <li key={f.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold">
                          {f.status_code} · {f.message}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(f.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Urgent actions">
          {urgentItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-3">
              {urgentItems.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {item.icon}
                    {item.text}
                  </span>
                  <Link to={item.to} className="text-xs font-bold text-primary underline">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity">
          {recentAudit.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No recorded activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentAudit.map((a: AnyRow) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-bold">{a.action}</span>{" "}
                    <span className="text-muted-foreground">by {a.actor_email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
