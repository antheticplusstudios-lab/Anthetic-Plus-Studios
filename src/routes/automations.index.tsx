import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { automations } from "@/lib/automations";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/automations/")({
  head: () => ({
    meta: [
      { title: "AI Automation Solutions — Autumic" },
      {
        name: "description",
        content:
          "Explore Autumic's AI receptionist, lead qualification, customer support and messaging automation solutions.",
      },
      { property: "og:title", content: "AI Automation Solutions — Autumic" },
      {
        property: "og:description",
        content:
          "Practical AI automation for customer communication, sales and repetitive business workflows.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-wide text-primary">
            {t("Automation solutions", "অটোমেশন সমাধান")}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            {t(
              "Four focused systems. Built around real business work.",
              "চারটি নির্দিষ্ট সিস্টেম। বাস্তব ব্যবসার কাজকে ঘিরে তৈরি।",
            )}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t(
              "Explore the automation systems available through Autumic. Each can be configured to your business and combined with custom workflows when needed.",
              "Autumic-এর অটোমেশন সিস্টেমগুলো দেখুন। প্রতিটি আপনার ব্যবসার জন্য কনফিগার করা এবং প্রয়োজনে কাস্টম ওয়ার্কফ্লোর সঙ্গে যুক্ত করা যায়।",
            )}
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {automations.map((item) => (
              <article key={item.slug} className="surface-card flex h-full flex-col p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl border border-border bg-muted">
                    <item.icon className="size-5" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.shortName}
                  </span>
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight">{item.name}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
                <ul className="mt-5 grid gap-2">
                  {item.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-6 mt-7">
                  <Button asChild variant="outline">
                    <Link to="/automations/$slug" params={{ slug: item.slug }}>
                      {t("Explore solution", "সমাধান দেখুন")} <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/contact">{t("Request a proposal", "প্রস্তাব নিন")}</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
