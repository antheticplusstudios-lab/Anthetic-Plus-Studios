import { useT } from "@/lib/i18n";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Clock3, GlobeLock, ShieldCheck, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { getAutomation, isAutomationSlug } from "@/lib/automations";
import { isListedProduct } from "@/lib/storefront";
import { Hero3D } from "@/components/hero-3d";

export const Route = createFileRoute("/automations/$slug")({
  loader: ({ params: { slug } }) => {
    const item = isAutomationSlug(slug) ? getAutomation(slug) : undefined;
    if (!item || !isListedProduct(slug)) throw notFound();
    return { slug: item.slug };
  },
  head: () => ({
    meta: [
      { title: "AI Automation Solutions — Autumic" },
      {
        name: "description",
        content:
          "AI Receptionist, AI Sales Agent, AI Customer Support Agent and AI Chatbot solutions configured around your business.",
      },
      { property: "og:title", content: "AI Automation Solutions — Autumic" },
      {
        property: "og:description",
        content: "Practical automation for customer communication, sales and repetitive business workflows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationDetail,
});

function AutomationDetail() {
  const t = useT();
  const { slug } = Route.useLoaderData();
  const item = getAutomation(slug)!;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="page-enter">
        <section className="relative border-b border-border px-4 pb-16 pt-12 sm:px-6 sm:pb-20">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_45%)]" />
          <Hero3D />
          <div className="relative mx-auto max-w-7xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
              {item.badge}
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-6xl">
              {item.name}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              {item.description}
            </p>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.15fr_.85fr]">
            <div className="space-y-10">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-primary">
                  {t("What it handles", "যেসব কাজ সামলায়")}
                </p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {t(
                    "One system, one job, done properly.",
                    "একটি সিস্টেম, একটি কাজ—নির্ভুলভাবে সম্পন্ন।",
                  )}
                </h2>
                <p className="mt-4 text-muted-foreground">
                  {item.shortName}{" "}
                  {t(
                    "can be configured around your team’s process, approved business information and customer hand-off requirements.",
                    "প্রথম দিন থেকেই কনফিগার, পরীক্ষিত ও পর্যবেক্ষিত অবস্থায় চালু হয়—আপনাকে মডেল, প্রম্পট বা সার্ভার নিয়ে কাজ করতে হবে না।",
                  )}
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {item.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex gap-3 rounded-2xl border border-border bg-card p-4"
                    >
                      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <p className="text-sm font-semibold leading-6">{feature}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-primary">
                  {t("Where it earns its keep", "যেখানে এটি কার্যকর")}
                </p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {t("Built for real operations.", "বাস্তব কাজের জন্য তৈরি।")}
                </h2>
                <div className="mt-6 space-y-4">
                  {item.useCases.map((useCase) => (
                    <div key={useCase} className="rounded-2xl border border-border bg-card/60 p-5">
                      <p className="text-sm leading-7 text-muted-foreground">{useCase}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-primary">
                  {t("Every order includes", "প্রতিটি অর্ডারের সঙ্গে রয়েছে")}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Include
                    icon={GlobeLock}
                    title={t("Domain lock", "ডোমেইন লক")}
                    body={t(
                      "One client ID bound to one domain — the script cannot run elsewhere.",
                      "একটি ক্লায়েন্ট আইডি একটি ডোমেইনের সঙ্গে যুক্ত—স্ক্রিপ্টটি অন্য কোথাও চলবে না।",
                    )}
                  />
                  <Include
                    icon={Clock3}
                    title={t("Renewal calendar", "নবায়নের সময়সূচি")}
                    body={t(
                      "Expiry, warning and grace dates are visible in your own dashboard.",
                      "মেয়াদ শেষ, সতর্কতা ও অতিরিক্ত সময়সীমার তারিখ আপনার ড্যাশবোর্ডেই দেখা যাবে।",
                    )}
                  />
                  <Include
                    icon={ShieldCheck}
                    title={t("Business guardrail", "ব্যবসায়িক সুরক্ষানীতি")}
                    body={t(
                      "Your services, hours and policies decide what the AI may claim.",
                      "আপনার সেবা, কর্মঘণ্টা ও নীতি অনুযায়ী AI কী বলতে পারবে তা নির্ধারিত হয়।",
                    )}
                  />
                  <Include
                    icon={Zap}
                    title={t("Failover pool", "বিকল্প মডেল পুল")}
                    body={t(
                      "A rotating model pool keeps the system answering under rate limits.",
                      "অনুরোধের সীমা থাকলেও পর্যায়ক্রমে ব্যবহৃত মডেল পুল সিস্টেমের উত্তর দেওয়া সচল রাখে।",
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Custom proposal card */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-3xl border border-primary/20 bg-card p-6 shadow-xl">
                <p className="text-sm font-bold text-primary">{t("Configured for your business", "আপনার ব্যবসার জন্য কনফিগার করা")}</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">{t("A solution shaped around your workflow.", "আপনার কাজের ধরন অনুযায়ী সমাধান।")}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{t("Autumic offers custom packages rather than a public fixed-price list. Tell us about your team, tools and goals, and we’ll prepare a proposal for your requirements.", "Autumic প্রকাশ্য নির্দিষ্ট মূল্যতালিকার বদলে কাস্টম প্যাকেজ দেয়। আপনার টিম, ব্যবহৃত টুল ও লক্ষ্য সম্পর্কে জানান, আমরা আপনার প্রয়োজন অনুযায়ী প্রস্তাব তৈরি করব।")}</p>
                <Button size="lg" className="mt-7 w-full" asChild>
                  <Link to="/contact">{t("Request a free consultation", "বিনামূল্যে পরামর্শ নিন")} <ArrowRight /></Link>
                </Button>
                <Button size="lg" variant="outline" className="mt-3 w-full" asChild>
                  <Link to="/checkout/$slug" params={{ slug: item.slug }} search={{ plan: "monthly" }}>{t("Continue to secure checkout", "নিরাপদ চেকআউটে এগিয়ে যান")}</Link>
                </Button>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("Custom integrations and implementation can be discussed when needed.", "প্রয়োজন হলে কাস্টম ইন্টিগ্রেশন ও বাস্তবায়ন নিয়েও আলোচনা করা যাবে।")}</p>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-t border-border bg-card/50 px-4 py-14 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">
                {t(
                  "Not sure which system to start with?",
                  "কোন সিস্টেম দিয়ে শুরু করবেন বুঝতে পারছেন না?",
                )}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {t(
                  "Tell us where enquiries are slipping and we will recommend the smallest stack that fixes it.",
                  "কোথায় গ্রাহকের অনুসন্ধান হারিয়ে যাচ্ছে জানান, আমরা সমাধানের জন্য ন্যূনতম প্রয়োজনীয় সিস্টেমের পরামর্শ দেব।",
                )}
              </p>
            </div>
            <Button size="lg" variant="outline" asChild>
              <Link to="/contact">{t("Talk to the team", "আমাদের দলের সঙ্গে কথা বলুন")}</Link>
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
