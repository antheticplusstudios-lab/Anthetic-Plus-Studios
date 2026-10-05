import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstances } from "@/hooks/use-portal";
import { automations } from "@/lib/automations";
import { daysRemaining, statusClass, statusLabels } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/dashboard/automations/")({
  head: () => ({
    meta: [
      { title: "My Automations — AntheticPlus Studios" },
      { name: "description", content: "Manage your active AI automations, domains and renewals." },
      { property: "og:title", content: "My AntheticPlus Automations" },
      { property: "og:description", content: "Manage AI automation status, domains, and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: instances = [], isLoading } = useInstances();
  return (
    <div className="page-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">My Automations</h1>
          <p className="mt-2 text-muted-foreground">Manage deployments, payment state, and configuration.</p>
        </div>
        <Button asChild>
          <Link to="/">
            <Plus />
            Add automation
          </Link>
        </Button>
      </div>
      <div className="mt-8 overflow-hidden rounded-3xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                {["Automation", "Website domain", "Status", "Days left", "Expiration", "Action"].map((h) => (
                  <th key={h} className="px-5 py-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {instances.map((item) => {
                const meta = automations.find((a) => a.slug === item.automation_slug);
                const left = daysRemaining(item.expires_at);
                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-5 py-5 font-bold">{meta?.name ?? item.automation_slug}</td>
                    <td className="px-5 text-muted-foreground">{item.website_domain}</td>
                    <td className="px-5">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>
                        {statusLabels[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className={`px-5 font-bold tabular-nums ${left <= 3 ? "text-destructive" : ""}`}>{left}</td>
                    <td className="px-5 text-muted-foreground">
                      {item.expires_at ? new Date(item.expires_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5">
                      <Button variant="ghost" asChild>
                        <Link to="/dashboard/automations/$id" params={{ id: item.id }}>
                          Manage <ArrowUpRight />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && instances.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    You haven’t ordered an automation yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
