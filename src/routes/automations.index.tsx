import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { AutomationCard } from "@/components/automation-card";
import { livePricingQueryOptions, storefrontItems } from "@/lib/pricing";

export const Route = createFileRoute("/automations/")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(livePricingQueryOptions),
  head: () => ({
    meta: [
      { title: "All Automations & Pricing — AntheticPlus Studios" },
      { name: "description", content: "Browse every AntheticPlus AI automation with live monthly and yearly pricing." },
      { property: "og:title", content: "All Automations & Pricing — AntheticPlus Studios" },
      { property: "og:description", content: "Voice, chat, SMS, booking and review systems — priced live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const { data } = useSuspenseQuery(livePricingQueryOptions);
  const items = storefrontItems(data);
  const [yearly, setYearly] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-wide text-primary">Automations</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Every system, one clear price.</h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Each automation is its own subscription, billed on a fixed UTC schedule.
              </p>
            </div>
            <div className="grid grid-cols-2 rounded-full border border-border bg-card p-1">
              <Button variant={!yearly ? "default" : "ghost"} size="sm" onClick={() => setYearly(false)}>
                Monthly
              </Button>
              <Button variant={yearly ? "default" : "ghost"} size="sm" onClick={() => setYearly(true)}>
                Yearly
              </Button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="mt-12 text-muted-foreground">No automations are available right now.</p>
          ) : (
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <AutomationCard key={item.slug} item={item} yearly={yearly} />
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
