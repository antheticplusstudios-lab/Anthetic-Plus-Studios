import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AdminPage, Loading, Panel, StatCard } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { getAnalytics } from "@/lib/admin-center.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — AntheticPlus Control Center" }] }),
  component: AnalyticsPage,
});

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getAnalytics);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "analytics", days], queryFn: () => fn({ data: { days } }) });

  return (
    <AdminPage
      title="Analytics"
      subtitle="Conversations, clients, provisioning outcomes, subscriptions and failure trends."
      actions={[7, 30, 90].map((d) => (
        <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
          {d} days
        </Button>
      ))}
    >
      {isLoading && <Loading />}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active clients" value={data.totals.activeClients} />
            <StatCard label="Total conversations" value={data.totals.conversations.toLocaleString()} />
            <StatCard label="Approved orders" value={`${data.totals.approved} · $${data.totals.revenue.toLocaleString()}`} />
            <StatCard label="AI failovers" value={data.totals.failures} />
          </div>

          <Panel title="Conversations over time">
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={axis} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={axis} allowDecimals={false} />
                  <Tooltip />
                  <Area dataKey="conversations" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Provisioning outcomes" description="Payments approved, rejected and waiting, by day">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={axis} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="approved" stackId="a" fill="var(--primary)" />
                    <Bar dataKey="pending" stackId="a" fill="var(--muted-foreground)" />
                    <Bar dataKey="rejected" stackId="a" fill="var(--destructive)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Failure trends" description="AI key failovers and human escalations">
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={data.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={axis} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Area dataKey="failures" stroke="var(--destructive)" fill="var(--destructive)" fillOpacity={0.15} />
                    <Area dataKey="escalations" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Subscription status">
              <ul className="grid gap-2 text-sm">
                {Object.entries(data.statusCounts).length === 0 && <li className="text-muted-foreground">No automations yet.</li>}
                {Object.entries(data.statusCounts).map(([s, n]) => (
                  <li key={s} className="flex items-center gap-3">
                    <span className="w-28 capitalize">{s.replace("_", " ")}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${(n / data.totals.automations) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right font-bold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {data.totals.expiringSoon} expiring within 7 days · {data.totals.killed} paused by kill switch
              </p>
            </Panel>
            <Panel title="Recent admin activity">
              <ul className="divide-y divide-border text-sm">
                {data.recentActivity.length === 0 && <li className="py-2 text-muted-foreground">Nothing yet.</li>}
                {data.recentActivity.map((a, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </AdminPage>
  );
}
