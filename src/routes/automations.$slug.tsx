import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Clock3, GlobeLock, ShieldCheck, Zap } from "lucide-react";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { automations } from "@/lib/automations";
import { livePricingQueryOptions, withLivePricing } from "@/lib/pricing";
import { money } from "@/components/admin-ui";

export const Route = createFileRoute("/automations/$slug")({
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    await queryClient.ensureQueryData(livePricingQueryOptions);
    const item = automations.find((entry) => entry.slug === slug);
    if (!item) throw notFound();
    return { slug: item.slug };
  },
  head: () => ({
    meta: [
      { title: "AI Automations — AntheticPlus Studios" },
      {
        name: "description",
        content:
          "Production AI systems for voice, SMS, chat, social, appointments and reviews — locked to your domain and billed on a transparent monthly plan.",
      },
      { property: "og:title", content: "AI Automations — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Answer, qualify, book, support, recover and collect reviews around the clock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationDetail,
});

function AutomationDetail() {
  const { slug } = Route.useLoaderData();
  const item = automations.find((entry) => entry.slug === slug)!;
  const { data: plans } = useSuspenseQuery(livePricingQueryOptions);
  const priced =
    withLivePricing(plans).find((entry) => entry.slug === item.slug) ?? {
      ...item,
      yearlyDiscountPct: 20,
      yearlyPrice: Math.round(item.price * 0.8) * 12,
      monthlyOf: (yearly: boolean) => (yearly ? Math.round(item.price * 0.8) : item.price),
    };
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="page-enter">
        <section className="relative border-b border-border px-4 pb-16 pt-12 sm:px-6 sm:pb-20">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_45%)]" />
          <div className="mx-auto max-w-7xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
              {item.badge}
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-6xl">
              {item.name}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{item.description}</p>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.15fr_.85fr]">
            <div className="space-y-10">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-primary">What it handles</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  One system, one job, done properly.
                </h2>
                <p className="mt-4 text-muted-foreground">
                  {item.shortName} ships configured, tested and monitored from day one — you never touch a model, a
                  prompt or a server.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {item.features.map((feature) => (
                    <div key={feature} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
                      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <p className="text-sm font-semibold leading-6">{feature}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-primary">Where it earns its keep</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Built for real operations.</h2>
                <div className="mt-6 space-y-4">
                  {item.useCases.map((useCase) => (
                    <div key={useCase} className="rounded-2xl border border-border bg-card/60 p-5">
                      <p className="text-sm leading-7 text-muted-foreground">{useCase}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-primary">Every order includes</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Include icon={GlobeLock} title="Domain lock" body="One client ID bound to one domain — the script cannot run elsewhere." />
                  <Include icon={Clock3} title="Renewal calendar" body="Expiry, warning and grace dates are visible in your own dashboard." />
                  <Include icon={ShieldCheck} title="Business guardrail" body="Your services, hours and policies decide what the AI may claim." />
                  <Include icon={Zap} title="Failover pool" body="A rotating model pool keeps the system answering under rate limits." />
                </div>
              </div>
            </div>

            {/* Price card */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-3xl border border-primary/20 bg-card p-6 shadow-xl">
                <p className="text-sm font-bold text-primary">Live pricing</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3">
                  <span className="text-sm font-bold">Yearly billing</span>
                  <Switch checked={yearly} onCheckedChange={(checked) => setYearly(Boolean(checked))} />
                </div>
                <p className="mt-6 flex items-end gap-1">
                  <span className="text-5xl font-extrabold tabular-nums tracking-tight">
                    {money(priced.monthlyOf(yearly))}
                  </span>
                  <span className="pb-1.5 text-sm font-semibold text-muted-foreground">/mo</span>
                </p>
                {yearly ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {money(priced.yearlyPrice)} billed once a year — {priced.yearlyDiscountPct}% off monthly.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Billed monthly. Switch to yearly any time and pay {priced.yearlyDiscountPct}% less per month.
                  </p>
                )}
                <Button size="lg" className="mt-7 w-full" asChild>
                  <Link
                    to="/checkout/$slug"
                    params={{ slug: item.slug }}
                    search={{ plan: yearly ? "yearly" : "monthly" }}
                  >
                    Order this system <ArrowRight />
                  </Link>
                </Button>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Payment is verified by a person, usually within a few hours. Your automation is activated with a
                  written expiry date the moment it is approved.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-t border-border bg-card/50 px-4 py-14 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Not sure which system to start with?</h2>
              <p className="mt-2 text-muted-foreground">
                Tell us where enquiries are slipping and we will recommend the smallest stack that fixes it.
              </p>
            </div>
            <Button size="lg" variant="outline" asChild>
              <a href="mailto:antheticplusstudios@gmail.com">Talk to the team</a>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Include({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof GlobeLock;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-card p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
