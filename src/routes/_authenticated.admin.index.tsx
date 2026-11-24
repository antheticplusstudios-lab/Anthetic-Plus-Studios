import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  KeyRound,
  TimerReset,
  UserCheck,
  RefreshCw,
  ArrowUpRight,
  MessageSquare,
  Zap,
  Users,
  CreditCard,
} from "lucide-react";
import { AdminPage, Loading, Panel, StatCard, money, timeAgo } from "@/components/admin-ui";
import {
  useAllInstances,
  useAllPayments,
  useAuditLog,
  useFailoverLog,
  useGroqKeys,
} from "@/hooks/use-admin";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/use-portal";
import { daysRemaining, isLive } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Overview — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Live automation operations, payments, and recent platform activity.",
      },
      { property: "og:title", content: "AntheticPlus Operations Overview" },
      { property: "og:description", content: "Automation operations and real platform activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCommandCenter,
});

function AdminCommandCenter() {
  const paymentQuery = useAllPayments();
  const instanceQuery = useAllInstances();
  const keyQuery = useGroqKeys();
  const failoverQuery = useFailoverLog();
  const auditQuery = useAuditLog();
  const { data: role } = useRole();
  const [period, setPeriod] = useState("30");
  const [refreshing, setRefreshing] = useState(false);
  const required = [paymentQuery, instanceQuery, auditQuery];
  const failed = required.some((query) => query.isError);
  const payments = paymentQuery.data ?? [];
  const instances = instanceQuery.data ?? [];
  const groqKeys = keyQuery.data ?? [];
  const failoverLog = failoverQuery.data ?? [];
  const auditLog = auditQuery.data ?? [];
  const since = Date.now() - Number(period) * 86400000;
  const periodPayments = payments.filter((p) => Date.parse(p.created_at) >= since);
  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        paymentQuery.refetch(),
        instanceQuery.refetch(),
        auditQuery.refetch(),
        ...(role === "owner" ? [keyQuery.refetch(), failoverQuery.refetch()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  }
  if (required.some((query) => query.isLoading)) return <Loading label="Loading operations" />;
  if (failed)
    return (
      <AdminPage title="Overview" subtitle="Operational data could not be loaded.">
        <div role="alert" className="space-y-4">
          <p className="text-sm text-destructive">
            Some services did not respond. No missing data is shown as zero.
          </p>
          <Button variant="outline" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw /> Retry connection
          </Button>
        </div>
      </AdminPage>
    );

  const approved = periodPayments.filter((p) => p.status === "approved");
  const approvedAmount = approved.reduce((sum: number, p) => {
    const amount = Number(p.amount ?? 0);
    return sum + amount;
  }, 0);

  const activeAutomations = instances.filter((i) => isLive(i)).length;
  const leadsCaptured = instances.reduce((s: number, i) => s + Number(i.leads_count ?? 0), 0);
  const conversationsHandled = instances.reduce(
    (s: number, i) => s + Number(i.conversations_count ?? 0),
    0,
  );

  const originCounts = new Map<string, number>();
  for (const p of periodPayments) {
    const origin = p.origin || "unknown";
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
  }
  const totalPayments = periodPayments.length || 1;

  const enabledKeys = groqKeys.filter((k) => k.enabled);
  const primaryKey = groqKeys.find((k) => k.is_primary);
  const cooldownKeys = groqKeys.filter(
    (k) => k.cooldown_until && new Date(k.cooldown_until).getTime() > Date.now(),
  );
  const recentFailover = [...failoverLog]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const expiringSoon = instances.filter((i) => {
    const d = daysRemaining(i.expires_at);
    return (i.status === "paid" || i.status === "active") && d <= 5 && d > 0;
  });
  const stoppedRevoked = instances.filter((i) => i.status === "stopped" || i.status === "revoked");
  const awaitingSetup = instances.filter((i) => i.status === "paid" && !i.client_id);

  const recentAudit = [...auditLog.filter((a) => Date.parse(a.created_at) >= since)]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const urgentItems: {
    icon: ReactNode;
    text: string;
    to: "/admin/verification" | "/admin/automations" | "/admin/infrastructure" | "/admin/creator";
  }[] = [];
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
  if (role === "owner" && cooldownKeys.length)
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
    <AdminPage
      title="Overview"
      subtitle="Your operations, conversations, and what needs attention."
      actions={
        <>
          <select
            aria-label="Reporting period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/assistants">
              Manage assistants <ArrowUpRight />
            </Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Approved order value"
          value={money(approvedAmount)}
          hint={`Orders created in the last ${period} days`}
          icon={<CreditCard className="size-4" />}
        />
        <StatCard
          label="Active automations"
          value={activeAutomations}
          tone="good"
          hint="Current backend lifecycle status"
          icon={<Zap className="size-4" />}
        />
        <StatCard
          label="Leads captured"
          value={leadsCaptured.toLocaleString()}
          hint="Lifetime recorded total"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Conversations handled"
          value={conversationsHandled.toLocaleString()}
          hint="Lifetime recorded total"
          icon={<MessageSquare className="size-4" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Attribution split" description={`Order origins · last ${period} days`}>
          {periodPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
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
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {role === "owner" ? (
          <Panel title="Infrastructure pulse" description="Groq pool health & recent failovers">
            {keyQuery.isError || failoverQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Provider health could not be loaded. Retry using Refresh.
              </p>
            ) : groqKeys.length === 0 ? (
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
                    {cooldownKeys
                      .map((k) => new Date(k.cooldown_until ?? 0).toLocaleTimeString())
                      .join(", ")}
                  </p>
                )}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Recent failovers
                  </p>
                  {recentFailover.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No failover events.</p>
                  ) : (
                    <ul className="space-y-2">
                      {recentFailover.map((f) => (
                        <li key={f.id} className="flex items-center justify-between text-sm">
                          <span className="font-semibold">
                            {f.status_code} · {f.message}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(f.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Panel>
        ) : (
          <Panel
            title="Assistant workspace"
            description="Configure knowledge, test replies, and manage deployments."
          >
            <div className="grid gap-4">
              <Link
                to="/admin/knowledge"
                className="flex items-center justify-between border-b border-border pb-4 text-sm"
              >
                Knowledge & sources <ArrowUpRight className="size-4" />
              </Link>
              <Link
                to="/admin/automations"
                className="flex items-center justify-between border-b border-border pb-4 text-sm"
              >
                Automation operations <ArrowUpRight className="size-4" />
              </Link>
              <Link to="/admin/analytics" className="flex items-center justify-between text-sm">
                Usage analytics <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Urgent actions">
          {urgentItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="space-y-3">
              {urgentItems.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3"
                >
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
            <p className="py-6 text-center text-sm text-muted-foreground">
              No recorded activity yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {recentAudit.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-bold">{a.action}</span>{" "}
                    <span className="text-muted-foreground">by {a.actor_email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
