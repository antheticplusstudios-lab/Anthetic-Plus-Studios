import { useT } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Hero3D } from "@/components/hero-3d";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { SubscriptionSchedule } from "@/components/subscription-schedule";
import { money } from "@/components/admin-ui";
import { useFeatureFlag } from "@/hooks/use-system-settings";
import { livePricingQueryOptions, storefrontItems } from "@/lib/pricing";
import type { BillingCycle } from "@/lib/billing";

export const Route = createFileRoute("/checkout/")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(livePricingQueryOptions),
  head: () => ({
    meta: [
      { title: "Checkout — AntheticPlus Studios" },
      {
        name: "description",
        content: "Choose an automation and billing cycle, and see your exact UTC billing schedule.",
      },
      { property: "og:title", content: "Checkout — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Transparent subscription scheduling with automatic stop at period end.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const t = useT();
  const { data } = useSuspenseQuery(livePricingQueryOptions);
  const storefrontOpen = useFeatureFlag("public_storefront");
  const items = storefrontItems(data);
  const [slug, setSlug] = useState(items[0]?.slug ?? "");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [start] = useState(() => new Date());
  const selected = items.find((i) => i.slug === slug);
  const total = selected ? (cycle === "yearly" ? selected.yearlyPrice : selected.price) : 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="relative mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_380px]">
        <Hero3D />
        <section className="relative">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t("Checkout", "চেকআউট")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              "Pick an automation and how often you want to be billed.",
              "একটি অটোমেশন এবং বিল দেওয়ার সময়সূচি বেছে নিন।",
            )}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => setSlug(item.slug)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  item.slug === slug
                    ? "border-primary bg-secondary"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <p className="font-bold">{item.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {money(item.price)}
                  {t("/mo", "/মাস")}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-6 inline-grid grid-cols-2 rounded-full border border-border bg-card p-1">
            <Button
              variant={cycle === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCycle("monthly")}
            >
              {t("Monthly · 30 days", "মাসিক · ৩০ দিন")}
            </Button>
            <Button
              variant={cycle === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCycle("yearly")}
            >
              {t("Yearly · 365 days", "বার্ষিক · ৩৬৫ দিন")}
            </Button>
          </div>
        </section>
        <aside className="relative space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{t("Due today", "আজ পরিশোধযোগ্য")}</p>
            <p className="text-3xl font-extrabold tabular-nums">{money(total)}</p>
            {selected && cycle === "yearly" && selected.yearlyDiscountPct > 0 && (
              <p className="text-sm text-primary">
                {t("Includes", "অন্তর্ভুক্ত রয়েছে")} {selected.yearlyDiscountPct}%{" "}
                {t("yearly saving", "বার্ষিক সাশ্রয়")}
              </p>
            )}
          </div>
          <SubscriptionSchedule cycle={cycle} start={start} />
          {!storefrontOpen && (
            <p className="rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
              {t(
                "New orders are paused while we finish onboarding our current clients. Email antheticplusstudios@gmail.com and we'll reserve your spot.",
                "বর্তমান ক্লায়েন্টদের অনবোর্ডিং শেষ না হওয়া পর্যন্ত নতুন অর্ডার বন্ধ রয়েছে। আপনার স্থান সংরক্ষণ করতে antheticplusstudios@gmail.com ঠিকানায় ইমেইল করুন।",
              )}
            </p>
          )}
          {selected && storefrontOpen && (
            <Button className="w-full" size="lg" asChild>
              <Link to="/checkout/$slug" params={{ slug: selected.slug }} search={{ plan: cycle }}>
                {t("Continue to payment", "পেমেন্টে এগিয়ে যান")}
              </Link>
            </Button>
          )}
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
