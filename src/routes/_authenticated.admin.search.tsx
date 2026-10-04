import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import { AdminPage, EmptyState, Loading, Panel, StatCard, timeAgo } from "@/components/admin-ui";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { globalAdminSearch } from "@/lib/admin-search.functions";

export const Route = createFileRoute("/_authenticated/admin/search")({
  head: () => ({ meta: [{ title: "Global Search — AntheticPlus Control Center" }] }),
  component: GlobalSearchPage,
});

function GlobalSearchPage() {
  const search = useServerFn(globalAdminSearch);
  const [q, setQ] = useState("");
  const needle = q.trim();
  const query = useQuery({
    queryKey: ["admin-global-search", needle],
    queryFn: () => search({ data: { q: needle } }),
    enabled: needle.length >= 2,
    staleTime: 15_000,
  });
  const totals = useMemo(() => ({
    users: query.data?.users.length ?? 0,
    automations: query.data?.automations.length ?? 0,
    orders: query.data?.orders.length ?? 0,
    conversations: query.data?.conversations.length ?? 0,
  }), [query.data]);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
    <AdminPage
      title="Global Search"
      subtitle="Search the operational index across clients, automations, orders and conversations. Results respect your admin scope; opening a result uses the existing detail page authorization."
    >
      <Panel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, client ID, automation, domain, order or conversation…" className="pl-9" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Enter at least 2 characters. Search is server-side and returns navigation-safe summaries only.</p>
      </Panel>

      {needle.length < 2 ? (
        <EmptyState title="Start typing to search" description="Try a company name, client ID, automation ID, domain, order ID or conversation ID." />
      ) : query.isLoading ? (
        <Loading label="Searching platform records" />
      ) : query.error ? (
        <Panel title="Search unavailable">{(query.error as Error).message}</Panel>
      ) : !total ? (
        <EmptyState title="No matching records" description={`Nothing matched “${needle}” within your current admin scope.`} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Users" value={totals.users} />
            <StatCard label="Automations" value={totals.automations} />
            <StatCard label="Orders" value={totals.orders} />
            <StatCard label="Conversations" value={totals.conversations} />
          </div>

          {query.data?.users.length ? (
            <Panel title="Users & clients">
              <div className="grid gap-2 sm:grid-cols-2">
                {query.data.users.map((u) => (
                  <Link key={u.id} to="/admin/clients/$id" params={{ id: u.id }} className="group rounded-xl border border-border p-4 hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.company || u.name || u.email || u.clientId}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{u.email || "No email"} · {u.clientId || "No client ID"}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {u.roles.map((role) => <Badge key={role} variant="outline" className="text-[10px] capitalize">{role}</Badge>)}
                      {u.originDomain && <Badge variant="outline" className="max-w-full truncate text-[10px]">{u.originDomain}</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {query.data?.automations.length ? (
            <Panel title="Automations">
              <div className="grid gap-2 sm:grid-cols-2">
                {query.data.automations.map((a) => (
                  <Link key={a.id} to="/admin/automations/$id" params={{ id: a.id }} className="group rounded-xl border border-border p-4 hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.name || a.type || a.id}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{a.domain || "No domain"} · {a.clientId}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] capitalize">{a.state}</Badge>
                      <Badge variant="outline" className="text-[10px]">{a.active ? "enabled" : "disabled"}</Badge>
                      {a.reinstall && <Badge variant="outline" className="text-[10px]">reinstall required</Badge>}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Last seen {timeAgo(a.lastSeenAt)}</p>
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {query.data?.orders.length ? (
            <Panel title="Orders">
              <div className="grid gap-2 sm:grid-cols-2">
                {query.data.orders.map((o) => (
                  <Link key={o.id} to="/admin/orders" className="group rounded-xl border border-border p-4 hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{o.orderId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{o.type || "order"} · client {o.clientId}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{o.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">${o.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {query.data?.conversations.length ? (
            <Panel title="Conversations">
              <div className="grid gap-2 sm:grid-cols-2">
                {query.data.conversations.map((c) => (
                  <Link key={c.id} to="/admin/automations/$id" params={{ id: c.automationId }} className="group rounded-xl border border-border p-4 hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.customer || c.id}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{c.channel} · {c.status} · automation {c.automationId}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground">Last message {timeAgo(c.lastMessageAt)}</p>
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}
        </>
      )}
    </AdminPage>
  );
}
