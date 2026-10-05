import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleAlert, Clock, CreditCard, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReactivationModal } from "@/components/reactivation-modal";
import { useInstances, useMyPayments } from "@/hooks/use-portal";
import { automations } from "@/lib/automations";
import { daysRemaining, statusClass, statusLabels, type Instance } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/dashboard/payments")({
  head: () => ({
    meta: [
      { title: "Subscription Payments — AntheticPlus Studios" },
      { name: "description", content: "Review verification status and renew your AntheticPlus subscriptions." },
      { property: "og:title", content: "AntheticPlus Subscription Payments" },
      { property: "og:description", content: "Track manual payment verification and submit renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: instances = [] } = useInstances();
  const { data: payments = [] } = useMyPayments();
  const [renewing, setRenewing] = useState<Instance | null>(null);

  const due = instances.filter((i) => i.status !== "paid" || daysRemaining(i.expires_at) <= 7);

  return (
    <div className="page-enter">
      {renewing && <ReactivationModal instance={renewing} onClose={() => setRenewing(null)} />}
      <h1 className="text-3xl font-extrabold">Subscription Payments</h1>
      <p className="mt-2 text-muted-foreground">Submit transaction references and track manual verification.</p>

      <section className="mt-8 grid gap-4">
        {due.length === 0 && (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Nothing due right now. Every automation is paid and active.
          </div>
        )}
        {due.map((item) => {
          const meta = automations.find((a) => a.slug === item.automation_slug);
          const left = daysRemaining(item.expires_at);
          return (
            <article
              key={item.id}
              className="grid gap-5 rounded-3xl border border-border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 shrink-0 text-primary" />
                  <h2 className="truncate font-extrabold">{meta?.name ?? item.automation_slug}</h2>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {item.website_domain}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusClass(item.status)}`}>
                    {statusLabels[item.status] ?? item.status}
                  </span>
                  {item.status === "paid" && <span>· {left} days left</span>}
                </p>
              </div>
              {item.status === "pending_payment" ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-foreground/12 px-4 py-2 text-sm font-bold text-foreground">
                  <Clock className="h-4 w-4" />
                  Pending verification
                </span>
              ) : (
                <Button onClick={() => setRenewing(item)}>
                  <RefreshCw />
                  Submit renewal
                </Button>
              )}
            </article>
          );
        })}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">Payment history</h2>
        <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  {["Date", "Service", "Amount", "Method", "Transaction ID", "Status"].map((h) => (
                    <th key={h} className="px-5 py-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-5 py-5 text-muted-foreground">{new Date(p.submitted_at).toLocaleDateString()}</td>
                    <td className="px-5 font-bold">
                      {automations.find((a) => a.slug === p.automation_slug)?.shortName ?? p.automation_slug}
                    </td>
                    <td className="px-5 font-bold tabular-nums">${Number(p.amount).toLocaleString()}</td>
                    <td className="px-5 text-muted-foreground">{p.payment_method}</td>
                    <td className="px-5 text-muted-foreground">{p.transaction_id}</td>
                    <td className="px-5">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(p.status)}`}>
                        {statusLabels[p.status] ?? p.status}
                      </span>
                      {p.status === "rejected" && p.rejection_reason && (
                        <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-destructive">
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {p.rejection_reason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                      No payments submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
