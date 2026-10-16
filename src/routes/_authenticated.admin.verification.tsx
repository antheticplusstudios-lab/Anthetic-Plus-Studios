import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy } from "lucide-react";
import { AdminPage, DataTable, Panel, StatusPill, money, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AUTOMATION_LABEL, FIELD_LABEL, embedSnippet } from "@/lib/catalog-v2";
import { adminListOrders, adminReviewOrder } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/verification")({
  head: () => ({ meta: [{ title: "Verification Queue — AntheticPlus" }] }),
  component: VerificationPage,
});

function VerificationPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending_verification" | "approved" | "rejected">(
    "pending_verification",
  );
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState<{ snippet: string; name: string } | null>(null);
  const orders = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: async () => {
      return adminListOrders({ data: { status: filter } });
    },
  });

  async function review(id: string, approve: boolean, why = "") {
    const o = orders.data?.find((x) => x.id === id);
    try {
      const result = await adminReviewOrder({ data: { orderId: id, approve, reason: why } });
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
      if (approve && o && result.snippet)
        setApproved({ snippet: result.snippet, name: o.full_name || o.client_id });
      else toast.success("Order rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
      return;
    }
    setRejecting(null);
    setReason("");
  }

  return (
    <AdminPage
      title="Verification Queue"
      subtitle="Every order from every storefront, in one place."
    >
      <div className="mb-4 flex gap-2">
        {(["pending_verification", "approved", "rejected"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
          >
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>
      <Panel>
        <DataTable
          head={[
            "Order",
            "Client",
            "Product",
            "Amount",
            "Payment proof",
            "Origin",
            "Submitted",
            "",
          ]}
          empty="No orders here."
          rows={(orders.data ?? []).map((o) => [
            <span className="font-mono text-xs">{o.order_id}</span>,
            <div>
              <div className="font-semibold">{o.full_name}</div>
              <div className="text-xs text-muted-foreground">
                {o.client_id} · {o.contact_email}
              </div>
            </div>,
            <div>
              <div>{AUTOMATION_LABEL[o.automation_type ?? ""]}</div>
              <div className="text-xs text-muted-foreground">
                {o.delivery_channel} · {o.target_domain_url}
              </div>
            </div>,
            money(o.total_amount),
            <div className="text-xs">
              <div className="font-semibold">
                {(o.payment_methods as { method_name: string } | null)?.method_name}
              </div>
              {Object.entries(o.payment_proof_data as Record<string, string>).map(([k, v]) => (
                <div key={k}>
                  {FIELD_LABEL[k] ?? k}: <span className="font-mono">{v}</span>
                </div>
              ))}
            </div>,
            o.origin_domain,
            timeAgo(o.created_at),
            o.status === "pending_verification" ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void review(o.id, true)}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(o.id)}>
                  Reject
                </Button>
              </div>
            ) : (
              <StatusPill status={o.status} />
            ),
          ])}
        />
      </Panel>
      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject order</DialogTitle>
            <DialogDescription>The client will see this reason.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Transaction ID not found in our statement."
          />
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3}
            onClick={() => rejecting && void review(rejecting, false, reason)}
          >
            Reject
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!approved} onOpenChange={(v) => !v && setApproved(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Payment approved — provisioning
              started
            </DialogTitle>
            <DialogDescription>
              {approved?.name}'s script is unlocked on their dashboard.
            </DialogDescription>
          </DialogHeader>
          <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">{approved?.snippet}</pre>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(approved?.snippet ?? "");
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" /> Copy script
          </Button>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
