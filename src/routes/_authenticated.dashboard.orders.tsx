import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusPill, money, shortDate } from "@/components/admin-ui";
import { useMyPayments, useInstances } from "@/hooks/use-portal";
import { AUTOMATION_LABEL } from "@/lib/catalog-v2";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  head: () => ({ meta: [{ title: "My Orders — AntheticPlus" }] }),
  component: OrdersPage,
});

const STATUS_TEXT: Record<string, string> = {
  pending_verification: "Pending Payment Verification",
  approved: "Approved",
  rejected: "Rejected",
};

function OrdersPage() {
  const { data: orders = [], isLoading: ordersLoading } = useMyPayments();
  const { data: autos = [], isLoading: autosLoading } = useInstances();
  const autoByOrder = new Map((autos ?? []).map((a) => [a.order_id, a.id]));

  if (ordersLoading || autosLoading)
    return <p className="text-muted-foreground">Loading orders…</p>;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">My Orders</h1>
          <p className="text-sm text-muted-foreground">
            Track payment verification and open your live automations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              to="/checkout/$slug"
              params={{ slug: "social-dm-assistant" }}
              search={{ plan: "monthly" }}
            >
              Order Social DM Assistant
            </Link>
          </Button>
          <Button asChild>
            <Link
              to="/checkout/$slug"
              params={{ slug: "voice-sms-receptionist" }}
              search={{ plan: "monthly" }}
            >
              Order Voice Receptionist
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        {orders.map((o) => {
          const aid = o.automation_id ?? autoByOrder.get(o.order_id);
          return (
            <div
              key={o.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex-1">
                <div className="font-bold">
                  {AUTOMATION_LABEL[o.automation_type ?? ""] ?? o.automation_slug}{" "}
                  <span className="text-xs text-muted-foreground">{o.order_id}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {o.target_domain_url} · {money(o.total_amount ?? o.amount)}/mo ·{" "}
                  {shortDate(o.created_at)}
                </div>
                {o.rejection_reason && (
                  <div className="mt-1 text-sm text-destructive">Reason: {o.rejection_reason}</div>
                )}
              </div>
              <StatusPill status={STATUS_TEXT[o.status] ?? o.payment_status ?? o.status} />
              {aid && (
                <Button asChild size="sm">
                  <Link to="/dashboard/portal/$id" params={{ id: aid }}>
                    Open
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
        {orders.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            No orders yet.
          </p>
        )}
      </div>
    </div>
  );
}
