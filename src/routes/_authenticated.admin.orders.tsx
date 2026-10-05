import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPage, DataTable, Loading, Panel, StatCard, StatusPill, money, timeAgo } from "@/components/admin-ui";
import { useAllPayments } from "@/hooks/use-admin";

export const Route = createFileRoute("/_authenticated/admin/orders")({ component: OrdersPage });

type Payment = {
  id: string;
  sender_name: string;
  transaction_id: string;
  automation_slug: string;
  billing_plan: string;
  amount: number;
  payment_method: string;
  origin: string;
  status: string;
  submitted_at: string;
};

function downloadCsv(rows: Payment[]) {
  const head = ["Submitted", "Client", "Automation", "Plan", "Amount", "Method", "Transaction", "Origin", "Status"];
  const escape = (value: string) => (value.includes(",") ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [head.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.submitted_at,
        row.sender_name,
        row.automation_slug,
        row.billing_plan,
        String(row.amount),
        row.payment_method,
        row.transaction_id,
        row.origin,
        row.status,
      ]
        .map((value) => escape(String(value ?? "")))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function OrdersPage() {
  const { data: payments, isLoading } = useAllPayments();
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const all = (payments ?? []) as Payment[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      if (origin !== "all" && p.origin !== origin) return false;
      if (status !== "all" && p.status !== status) return false;
      if (q) {
        const hay = `${p.sender_name} ${p.transaction_id} ${p.automation_slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const submitted = new Date(p.submitted_at).getTime();
      if (from && submitted < new Date(from).getTime()) return false;
      if (to && submitted > new Date(to).getTime() + 86_400_000) return false;
      return true;
    });
  }, [all, search, origin, status, from, to]);

  if (isLoading) return <Loading />;

  const approvedValue = all.filter((p) => p.status === "approved").reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingValue = all.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0);
  const rejectedCount = all.filter((p) => p.status === "rejected").length;
  const grossSubmitted = all.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <AdminPage
      title="Orders Master Ledger"
      subtitle="Every order the storefronts and dashboards have ever produced, filterable and exportable."
      actions={<Button onClick={() => downloadCsv(filtered)}>Export CSV</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gross submitted (all)" value={money(grossSubmitted)} />
        <StatCard label="Approved value" value={money(approvedValue)} tone="good" />
        <StatCard label="Pending value" value={money(pendingValue)} tone="warn" />
        <StatCard label="Rejected count" value={rejectedCount} tone="bad" />
      </div>

      <Panel title="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search client, transaction, automation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option value="all">All origins</option>
            <option value="storefront">Storefront</option>
            <option value="dashboard">Dashboard</option>
            <option value="admin">Admin</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Panel>

      <Panel title={`Orders (${filtered.length})`}>
        <DataTable
          head={["Submitted", "Client", "Automation", "Plan", "Amount", "Method", "Transaction", "Origin", "Status"]}
          empty="No orders match these filters."
          rows={filtered.map((p) => [
            timeAgo(p.submitted_at),
            p.sender_name,
            p.automation_slug,
            p.billing_plan,
            <span className="tabular-nums" key="amount">{money(p.amount)}</span>,
            p.payment_method,
            p.transaction_id,
            <span className="capitalize" key="origin">{p.origin}</span>,
            <StatusPill status={p.status} key="status" />,
          ])}
        />
      </Panel>
    </AdminPage>
  );
}
