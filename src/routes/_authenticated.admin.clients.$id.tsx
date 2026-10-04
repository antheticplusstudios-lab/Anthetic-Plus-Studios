import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminPage, DataTable, Loading, Panel, StatCard, money, shortDate, timeAgo } from "@/components/admin-ui";
import { getUserDetail } from "@/lib/command-center.functions";

export const Route = createFileRoute("/_authenticated/admin/clients/$id")({
  head: () => ({
    meta: [
      { title: "Client Detail — AntheticPlus Control Center" },
      { name: "description", content: "Full account record: profile, roles, restrictions, orders, automations, usage, conversations and audit trail." },
      { property: "og:title", content: "Client Detail — AntheticPlus Control Center" },
      { property: "og:description", content: "Full account record for one AntheticPlus user." },
    ],
  }),
  component: ClientDetailPage,
});

type Row = Record<string, string | number | boolean | null>;

function ClientDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cc", "user", id],
    queryFn: () => getUserDetail({ data: { userId: id } }),
  });

  if (isLoading) return <Loading label="Loading account" />;
  if (error) return <Panel title="Account unavailable">{(error as Error).message}</Panel>;
  if (!data) return <Panel title="Not found">This account does not exist.</Panel>;

  const profile = (data.profile ?? {}) as Row;
  const restriction = (data.restriction ?? null) as Row | null;
  const orders = data.orders as Row[];
  const automations = data.automations as Row[];
  const usage = data.usage as Row[];
  const conversations = data.conversations as Row[];
  const knowledge = data.knowledge as Row[];
  const integrations = data.integrations as Row[];
  const audit = data.audit as Row[];

  const tokens = usage.reduce((s, u) => s + Number(u["tokens_used"] ?? 0), 0);

  return (
    <AdminPage
      title={String(profile["company_name"] ?? profile["full_name"] ?? data.user.email ?? "Account")}
      subtitle={`${data.user.email} · client ${profile["client_id"] ?? "—"} · ${data.origin.label}`}
      actions={
        <Link to="/admin/clients" className="text-sm font-semibold text-primary underline">
          Back to directory
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Automations" value={automations.length} />
        <StatCard label="Orders" value={orders.length} />
        <StatCard label="Tokens used" value={tokens.toLocaleString()} />
        <StatCard
          label="Account status"
          value={restriction ? String(restriction["status"]) : "active"}
          tone={restriction && restriction["status"] !== "active" ? "bad" : "good"}
          hint={restriction ? String(restriction["reason"] ?? "") : "No restrictions"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Account">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate font-semibold">{data.user.email}</dd>
            <dt className="text-muted-foreground">Sign-in provider</dt>
            <dd className="font-semibold capitalize">{String(data.user.provider)}</dd>
            <dt className="text-muted-foreground">Email confirmed</dt>
            <dd className="font-semibold">{data.user.emailConfirmed ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Roles</dt>
            <dd className="font-semibold capitalize">{data.roles.length ? data.roles.join(", ") : "client"}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-semibold">{shortDate(String(data.user.createdAt))}</dd>
            <dt className="text-muted-foreground">Last sign-in</dt>
            <dd className="font-semibold">{data.user.lastSignIn ? timeAgo(String(data.user.lastSignIn)) : "never"}</dd>
            <dt className="text-muted-foreground">Signup origin</dt>
            <dd className="font-semibold">{data.origin.label}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="font-semibold">{String(profile["phone"] ?? "—")}</dd>
          </dl>
        </Panel>

        <Panel title="Automations">
          <DataTable
            head={["Type", "Domain", "State", "Expires", ""]}
            rows={automations.map((a) => [
              <span key="t" className="font-semibold capitalize">
                {String(a["automation_type"]).replace(/_/g, " ")}
              </span>,
              String(a["domain_url"] ?? "—"),
              <span key="s" className="capitalize">
                {String(a["run_state"])}
                {a["requires_reinstallation"] ? " · reinstall" : ""}
              </span>,
              shortDate(a["expires_at"] as string | null),
              <Link key="o" to="/admin/automations/$id" params={{ id: String(a["id"]) }} className="text-xs font-bold text-primary underline">
                Open
              </Link>,
            ])}
            empty="No automations yet."
          />
        </Panel>
      </div>

      <Panel title="Orders">
        <DataTable
          head={["Order", "Product", "Amount", "Status", "Method", "Placed", "Reviewed"]}
          rows={orders.map((o) => [
            <span key="id" className="font-mono text-xs">
              {String(o["order_id"])}
            </span>,
            <span key="p" className="capitalize">
              {String(o["automation_type"]).replace(/_/g, " ")}
            </span>,
            money(o["total_amount"] as number),
            <span key="s" className="capitalize">
              {String(o["status"])}
              {o["rejection_reason"] ? ` · ${String(o["rejection_reason"])}` : ""}
            </span>,
            String((o as unknown as { payment_methods?: { method_name?: string } }).payment_methods?.method_name ?? "—"),
            shortDate(o["created_at"] as string),
            shortDate(o["reviewed_at"] as string | null),
          ])}
          empty="No orders yet."
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Conversations" description="Most recent 50 across all channels">
          <DataTable
            head={["Channel", "Status", "Last message"]}
            rows={conversations.map((c) => [
              <span key="c" className="capitalize">
                {String(c["channel"])}
              </span>,
              <span key="s" className="capitalize">
                {String(c["status"])}
              </span>,
              c["last_message_at"] ? timeAgo(c["last_message_at"] as string) : "—",
            ])}
            empty="No conversations recorded."
          />
        </Panel>
        <Panel title="Knowledge & integrations">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Knowledge documents</p>
          <DataTable
            head={["Source", "Name", "Added"]}
            rows={knowledge.map((k) => [String(k["source_type"]), String(k["source_name"] ?? "—"), shortDate(k["created_at"] as string)])}
            empty="No knowledge documents."
          />
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrations</p>
          <DataTable
            head={["Provider", "Status", "Updated"]}
            rows={integrations.map((i) => [
              <span key="p" className="capitalize">
                {String(i["provider"])}
              </span>,
              <span key="s" className={i["status"] === "connected" ? "text-success" : "text-muted-foreground"}>
                {i["status"] === "connected" ? "Connected" : "Pending provider credentials"}
              </span>,
              i["updated_at"] ? timeAgo(i["updated_at"] as string) : "—",
            ])}
            empty="No integrations connected."
          />
        </Panel>
      </div>

      <Panel title="Audit trail" description="Last 100 events touching this account">
        <DataTable
          head={["Event", "Actor", "When"]}
          rows={audit.map((a) => [
            <span key="e" className="font-semibold">
              {String(a["event_type"])}
            </span>,
            <span key="a" className="font-mono text-xs">
              {String(a["actor"] ?? "system")}
            </span>,
            timeAgo(a["created_at"] as string),
          ])}
          empty="No audit entries."
        />
      </Panel>
    </AdminPage>
  );
}
