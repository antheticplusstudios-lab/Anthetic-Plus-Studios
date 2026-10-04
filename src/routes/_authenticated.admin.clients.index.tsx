import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPage, DataTable, Loading, Panel, StatCard, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listUsers, moderateUser } from "@/lib/command-center.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/clients/")({
  head: () => ({
    meta: [
      { title: "Users & Clients — AntheticPlus Control Center" },
      { name: "description", content: "Unified directory of every AntheticPlus user, client, partner and staff member with moderation controls." },
      { property: "og:title", content: "Users & Clients — AntheticPlus Control Center" },
      { property: "og:description", content: "Unified directory of every AntheticPlus user with moderation controls." },
    ],
  }),
  component: ClientsPage,
});

type User = Awaited<ReturnType<typeof listUsers>>["users"][number];

const ACTIONS = [
  { key: "suspend", label: "Suspend" },
  { key: "unsuspend", label: "Unsuspend" },
  { key: "ban", label: "Ban" },
  { key: "unban", label: "Unban" },
  { key: "mute", label: "Mute" },
  { key: "unmute", label: "Unmute" },
  { key: "deactivate", label: "Deactivate" },
  { key: "activate", label: "Activate" },
  { key: "force_signout", label: "Force sign-out" },
] as const;

const TABS = [
  { key: "all", label: "Everyone" },
  { key: "clients", label: "Clients" },
  { key: "partners", label: "Partners" },
  { key: "staff", label: "Staff" },
  { key: "restricted", label: "Banned / restricted" },
] as const;

function originTone(kind: string) {
  if (kind === "partner") return "border-foreground/30";
  if (kind === "direct") return "border-success/40 text-success";
  return "border-border text-muted-foreground";
}

function ClientsPage() {
  const qc = useQueryClient();
  const moderate = useServerFn(moderateUser);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<User | null>(null);
  const [action, setAction] = useState<(typeof ACTIONS)[number]["key"]>("suspend");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({ queryKey: ["cc", "users"], queryFn: () => listUsers() });

  const users = useMemo(() => {
    const all = data?.users ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((u) => {
      if (needle && !`${u.email} ${u.name} ${u.company} ${u.clientId} ${u.originDomain}`.toLowerCase().includes(needle)) return false;
      if (tab === "clients") return u.roles.includes("client") || (!u.roles.length && u.automations > 0);
      if (tab === "partners") return u.roles.includes("partner");
      if (tab === "staff") return u.roles.some((r) => ["owner", "admin", "verifier", "support"].includes(r));
      if (tab === "restricted") return u.status !== "active" || u.muted;
      return true;
    });
  }, [data, tab, q]);

  if (isLoading) return <Loading label="Loading users" />;
  if (error) return <Panel title="Directory unavailable">{(error as Error).message}</Panel>;

  const all = data?.users ?? [];

  const submit = async () => {
    if (!target) return;
    if (reason.trim().length < 3) {
      toast.error("Add a reason — it is written to the audit log.");
      return;
    }
    setBusy(true);
    try {
      const r = await moderate({ data: { userId: target.id, action, reason: reason.trim() } });
      toast.success(`${target.email} → ${r.status}${r.muted ? " (muted)" : ""}`);
      setTarget(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["cc", "users"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = users.map((u) => [
    <div key="who" className="min-w-0">
      <Link to="/admin/clients/$id" params={{ id: u.id }} className="block truncate font-semibold hover:underline">
        {u.email}
      </Link>
      <p className="truncate text-xs text-muted-foreground">{u.company || u.name || "—"}</p>
    </div>,
    <span key="cid" className="tabular-nums text-xs">
      {u.clientId || "—"}
    </span>,
    <span key="roles" className="text-xs capitalize">
      {u.roles.length ? u.roles.join(", ") : "client"}
    </span>,
    <span key="origin" className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", originTone(u.origin.kind))}>
      {u.origin.label}
    </span>,
    <span
      key="status"
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
        u.status === "active" ? "border-success/40 text-success" : "border-destructive/50 text-destructive",
      )}
    >
      {u.status}
      {u.muted ? " · muted" : ""}
    </span>,
    <span key="autos" className="tabular-nums text-xs">
      {u.activeAutomations}/{u.automations}
    </span>,
    <span key="sub" className="text-xs capitalize">
      {u.subscription}
    </span>,
    <span key="act" className="text-xs">
      {u.lastActivity ? timeAgo(u.lastActivity) : "never"}
    </span>,
    <Button key="mod" size="sm" variant="outline" onClick={() => setTarget(u)}>
      Moderate
    </Button>,
  ]);

  return (
    <AdminPage
      title="Users & Clients"
      subtitle="One directory for clients, partners and staff. Moderation runs server-side, syncs the auth service and writes an audit entry."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={all.length} />
        <StatCard label="With automations" value={all.filter((u) => u.automations > 0).length} tone="good" />
        <StatCard label="Restricted" value={all.filter((u) => u.status !== "active" || u.muted).length} tone="bad" />
        <StatCard label="Partner-origin" value={all.filter((u) => u.origin.kind === "partner").length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, company, client ID…" className="sm:max-w-xs" />
      </div>

      <Panel title={`${users.length} user${users.length === 1 ? "" : "s"}`}>
        <DataTable
          head={["User", "Client ID", "Roles", "Signup origin", "Status", "Automations", "Subscription", "Last activity", ""]}
          rows={rows}
          empty="No users match this view."
        />
      </Panel>

      {target && (
        <Panel title={`Moderate ${target.email}`} description="The reason is stored with the audit entry.">
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <Button key={a.key} size="sm" variant={action === a.key ? "default" : "outline"} onClick={() => setAction(a.key)}>
                {a.label}
              </Button>
            ))}
          </div>
          <Input
            className="mt-4"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required, min 3 characters)"
          />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Applying…" : "Apply"}
            </Button>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}
    </AdminPage>
  );
}
