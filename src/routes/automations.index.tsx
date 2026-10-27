import { useT } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { AutomationCard } from "@/components/automation-card";
import { Hero3D } from "@/components/hero-3d";
import { SolutionsSection } from "@/components/solutions-section";
import { livePricingQueryOptions, storefrontItems } from "@/lib/pricing";

export const Route = createFileRoute("/automations/")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(livePricingQueryOptions),
  head: () => ({
    meta: [
      { title: "All Automations & Pricing — AntheticPlus Studios" },
      {
        name: "description",
        content: "Browse every AntheticPlus AI automation with live monthly and yearly pricing.",
      },
      { property: "og:title", content: "All Automations & Pricing — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Voice, chat, SMS, booking and review systems — priced live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const t = useT();
  const { data } = useSuspenseQuery(livePricingQueryOptions);
  const items = storefrontItems(data);
  const [yearly, setYearly] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <Hero3D />
            <div className="relative max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-wide text-primary">
                {t("Automations", "অটোমেশন")}
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
                {t("Public systems, one clear price.", "সবার জন্য সিস্টেম, এক স্বচ্ছ মূল্য।")}
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                {t(
                  "Each automation is its own subscription, billed on a fixed UTC schedule.",
                  "প্রতিটি অটোমেশনের আলাদা সাবস্ক্রিপশন রয়েছে, নির্দিষ্ট UTC সময়সূচি অনুযায়ী বিল করা হয়।",
                )}
              </p>
            </div>
            <div className="relative grid grid-cols-2 rounded-full border border-border bg-card p-1">
              <Button
                variant={!yearly ? "default" : "ghost"}
                size="sm"
                onClick={() => setYearly(false)}
              >
                {t("Monthly", "মাসিক")}
              </Button>
              <Button
                variant={yearly ? "default" : "ghost"}
                size="sm"
                onClick={() => setYearly(true)}
              >
                {t("Yearly", "বার্ষিক")}
              </Button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="mt-12 text-muted-foreground">
              {t("No automations are available right now.", "এই মুহূর্তে কোনো অটোমেশন উপলব্ধ নেই।")}
            </p>
          ) : (
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <AutomationCard key={item.slug} item={item} yearly={yearly} />
              ))}
            </div>
          )}
          <SolutionsSection />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
