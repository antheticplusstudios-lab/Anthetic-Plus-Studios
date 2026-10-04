import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Bot, Clock, CreditCard, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstances, useProfile } from "@/hooks/use-portal";
import { automations } from "@/lib/automations";
import { daysRemaining, statusClass, statusLabels } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AntheticPlus Studios" },
      { name: "description", content: "Your AntheticPlus automation overview, metrics and renewal countdown." },
      { property: "og:title", content: "AntheticPlus Client Dashboard" },
      { property: "og:description", content: "Monitor automations, conversations, leads and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardOverview,
});

function DashboardOverview() {
  const { data: profile } = useProfile();
  const { data: instances = [], isLoading } = useInstances();

  const live = instances.filter((i) => i.status === "paid" && daysRemaining(i.expires_at) > 0);
  const conversations = instances.reduce((sum, i) => sum + i.conversations_count, 0);
  const leads = instances.reduce((sum, i) => sum + i.leads_count, 0);
  const pending = instances.filter((i) => i.status === "pending_payment").length;
  const soonest = live
    .map((i) => daysRemaining(i.expires_at))
    .sort((a, b) => a - b)
    .at(0);
  const expired = instances.filter((i) => i.status !== "paid" || daysRemaining(i.expires_at) === 0);

  const stats = [
    { label: "Active automations", value: String(live.length), icon: Bot },
    { label: "Conversations handled", value: conversations.toLocaleString(), icon: Activity },
    { label: "Leads captured", value: leads.toLocaleString(), icon: UsersRound },
    { label: "Awaiting verification", value: String(pending), icon: CreditCard },
  ];

  return (
    <div className="page-enter">
      <p className="text-sm font-bold text-primary">
        {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
        Welcome back{profile?.company_name ? `, ${profile.company_name}` : ""}.
      </h1>
      <p className="mt-2 text-muted-foreground">Here’s how your AI workforce is performing.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-5 text-3xl font-extrabold">{stat.value}</p>
          </div>
        ))}
      </div>

      <section
        className={`mt-6 overflow-hidden rounded-3xl border p-6 shadow-sm sm:p-8 ${soonest === undefined ? "border-border bg-card" : soonest <= 3 ? "border-destructive/40 bg-destructive/8" : "border-primary/25 bg-secondary"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              <Clock className="h-4 w-4" />
              Days remaining
            </span>
            <p className="mt-3 text-6xl font-extrabold leading-none tabular-nums sm:text-7xl">{soonest ?? 0}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {soonest === undefined
                ? "No active subscription. Submit a payment to start your countdown."
                : soonest <= 3
                  ? "Renew now to avoid a hard domain freeze on your website."
                  : "Until your next renewal window opens."}
            </p>
          </div>
          <Button asChild>
            <Link to="/dashboard/payments">
              Manage renewals <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold">Automation health</h2>
            <p className="mt-1 text-sm text-muted-foreground">Live status across your workspace</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/dashboard/automations">View all</Link>
          </Button>
        </div>
        <div className="mt-6 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading your automations…</p>}
          {!isLoading && instances.length === 0 && (
            <div className="rounded-2xl bg-muted/50 p-6 text-center">
              <p className="font-bold">No automations yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Pick an AI teammate from the catalog to get started.</p>
              <Button className="mt-4" asChild>
                <Link to="/">Explore automations</Link>
              </Button>
            </div>
          )}
          {instances.map((item) => {
            const meta = automations.find((a) => a.slug === item.automation_slug);
            return (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-muted/50 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{meta?.name ?? item.automation_slug}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.website_domain}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>
                  {statusLabels[item.status] ?? item.status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {expired.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          {expired.length} automation{expired.length > 1 ? "s" : ""} need attention —{" "}
          <Link to="/dashboard/payments" className="font-bold text-primary hover:underline">
            submit a transaction ID
          </Link>
          .
        </p>
      )}
    </div>
  );
}
