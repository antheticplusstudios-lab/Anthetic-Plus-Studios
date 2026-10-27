import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Gauge,
  Layers,
  LineChart,
  Server,
  ShieldCheck,
  Sparkles,
  Timer,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { livePricingQueryOptions, storefrontItems } from "@/lib/pricing";
import { money } from "@/components/admin-ui";
import { Reveal } from "@/components/motion";
import { HomeHero } from "@/components/home/home-hero";
import { useT } from "@/lib/i18n";
import {
  FourSystems,
  JourneySection,
  ReadinessReport,
  WhyAnthetic,
} from "@/components/home/front-office";

export const Route = createFileRoute("/")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(livePricingQueryOptions),
  head: () => ({
    meta: [
      { title: "AntheticPlus Studios — Build. Automate. Grow." },
      {
        name: "description",
        content:
          "AI assistants, multilingual voice experiences and workflow automation that help teams work smarter and scale with confidence.",
      },
      { property: "og:title", content: "AntheticPlus Studios — Build. Automate. Grow." },
      {
        property: "og:description",
        content:
          "Intelligent AI assistants, multilingual voice and workflow automation — on your domain, monitored, with human handoff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const t = useT();
  const steps = [
    {
      icon: Layers,
      title: t("Pick the system", "সিস্টেম বেছে নিন"),
      body: t(
        "Choose one focused automation or a connected stack. Every system is already built, tested and running for real businesses.",
        "একটি নির্দিষ্ট অটোমেশন বা একসাথে কয়েকটি বেছে নিন। প্রতিটি সিস্টেম আগে থেকেই তৈরি, পরীক্ষিত এবং বাস্তব ব্যবসায় চলছে।",
      ),
    },
    {
      icon: Sparkles,
      title: t("Give it your business", "আপনার ব্যবসার তথ্য দিন"),
      body: t(
        "Paste your services, hours, pricing and policies into the onboarding form. That context becomes the guardrail your AI never leaves.",
        "অনবোর্ডিং ফর্মে আপনার সার্ভিস, সময়সূচি, মূল্য ও নীতিমালা দিন। এই তথ্যই AI-এর সীমারেখা।",
      ),
    },
    {
      icon: ShieldCheck,
      title: t("Locked to your domain", "আপনার ডোমেইনে লক"),
      body: t(
        "We bind one client ID to one domain and hand you a single script tag. Nothing works anywhere else, and nothing is shared between clients.",
        "একটি ক্লায়েন্ট আইডি একটি ডোমেইনে আবদ্ধ করে আপনাকে একটি স্ক্রিপ্ট ট্যাগ দিই। অন্য কোথাও কাজ করে না, কোনো ক্লায়েন্টের মধ্যে কিছু শেয়ার হয় না।",
      ),
    },
  ];

  const reasons = [
    {
      icon: Gauge,
      title: t("Built on infrastructure you can trust", "ভরসাযোগ্য অবকাঠামোর ওপর তৈরি"),
      body: t(
        "A rotating model pool with automatic failover and a live record of every rate-limit event, so one provider hiccup never silences your front desk.",
        "স্বয়ংক্রিয় ফেইলওভারসহ ঘূর্ণায়মান মডেল পুল এবং প্রতিটি রেট-লিমিটের লাইভ রেকর্ড — তাই একটি প্রোভাইডারের সমস্যায় আপনার ফ্রন্ট ডেস্ক থেমে যায় না।",
      ),
    },
    {
      icon: LineChart,
      title: t("Every conversation is a record", "প্রতিটি কথোপকথন একটি রেকর্ড"),
      body: t(
        "Transcripts, token usage and lead counts stay attached to your automation, so you can see exactly what the system handled and what it cost.",
        "ট্রান্সক্রিপ্ট, টোকেন ব্যবহার ও লিড সংখ্যা আপনার অটোমেশনের সাথে থাকে — সিস্টেম কী সামলেছে ও খরচ কত, ঠিক দেখতে পান।",
      ),
    },
    {
      icon: Timer,
      title: t("Renewals that never surprise you", "নবায়নে কোনো চমক নেই"),
      body: t(
        "Day 25 you get a warning, not a shutdown. Grace periods are explicit, and an admin can extend them the moment something slips.",
        "২৫তম দিনে সতর্কবার্তা পাবেন, বন্ধ হবে না। গ্রেস সময় স্পষ্ট, আর প্রয়োজনে অ্যাডমিন তা বাড়াতে পারেন।",
      ),
    },
  ];

  const faqs = [
    {
      q: t(
        "Do I need a credit card or payment gateway?",
        "ক্রেডিট কার্ড বা পেমেন্ট গেটওয়ে লাগবে কি?",
      ),
      a: t(
        "No. Orders are paid by bank transfer, crypto or mobile money. You submit the transaction reference, a human verifies it, and your automation is activated with the exact expiry date on the order.",
        "না। ব্যাংক ট্রান্সফার, ক্রিপ্টো বা মোবাইল মানিতে পেমেন্ট হয়। আপনি ট্রানজ্যাকশন রেফারেন্স দেন, একজন মানুষ যাচাই করেন, তারপর অর্ডারের নির্দিষ্ট মেয়াদসহ অটোমেশন চালু হয়।",
      ),
    },
    {
      q: t("How fast is my automation live?", "অটোমেশন কত দ্রুত চালু হয়?"),
      a: t(
        "Once payment is approved we provision your client ID, bind it to your domain and hand you the embed script the same day. Most clients are answering customers within a few hours.",
        "পেমেন্ট অনুমোদনের পর একই দিনে আমরা ক্লায়েন্ট আইডি তৈরি করে ডোমেইনে যুক্ত করি ও এমবেড স্ক্রিপ্ট দিই। বেশিরভাগ ক্লায়েন্ট কয়েক ঘণ্টার মধ্যেই গ্রাহকদের উত্তর দিতে শুরু করেন।",
      ),
    },
    {
      q: t("What happens if my subscription lapses?", "সাবস্ক্রিপশনের মেয়াদ শেষ হলে কী হয়?"),
      a: t(
        "You get a warning five days before expiry, then a grace window, then the system stops answering on your site. Nothing is deleted, so reconnecting takes one payment.",
        "মেয়াদ শেষের পাঁচ দিন আগে সতর্কবার্তা, তারপর গ্রেস সময়, এরপর সিস্টেম আপনার সাইটে উত্তর দেওয়া বন্ধ করে। কিছুই মুছে যায় না, একটি পেমেন্টেই আবার চালু।",
      ),
    },
    {
      q: t("Can the AI say anything it wants?", "AI কি যা খুশি বলতে পারে?"),
      a: t(
        "No. Your business context plus a global safety baseline decide what it may claim. It never invents prices, availability or legal and medical advice, and it escalates when unsure.",
        "না। আপনার ব্যবসার তথ্য ও বৈশ্বিক নিরাপত্তা ভিত্তি ঠিক করে এটি কী বলবে। এটি কখনো মূল্য, প্রাপ্যতা বা আইনি/চিকিৎসা পরামর্শ বানিয়ে বলে না, অনিশ্চিত হলে হস্তান্তর করে।",
      ),
    },
    {
      q: t("Which channels does each system cover?", "প্রতিটি সিস্টেম কোন চ্যানেল কভার করে?"),
      a: t(
        "Voice and SMS, website chat, WhatsApp, Instagram and Messenger, with each system sold on its own so you only pay for what you use.",
        "ভয়েস ও এসএমএস, ওয়েবসাইট চ্যাট, WhatsApp, Instagram ও Messenger — প্রতিটি সিস্টেম আলাদা বিক্রি হয়, তাই যা ব্যবহার করেন শুধু তার জন্যই পে করেন।",
      ),
    },
  ];

  const { data: plans } = useSuspenseQuery(livePricingQueryOptions);
  const items = storefrontItems(plans);
  const [yearly, setYearly] = useState(false);

  // Facts only: each value is a property of the platform itself, not a customer count.
  const metrics = [
    {
      icon: Clock3,
      value: "বাংলা · EN",
      label: t("Multilingual conversations", "বহুভাষিক কথোপকথন"),
    },
    {
      icon: Server,
      value: t("Failover", "ফেইলওভার"),
      label: t("Provider pool routing", "প্রোভাইডার পুল রাউটিং"),
    },
    {
      icon: Layers,
      value: String(items.length),
      label: t("Systems available now", "এখন উপলব্ধ সিস্টেম"),
    },
    {
      icon: Wallet,
      value: "0",
      label: t("Cards or gateways required", "কার্ড বা গেটওয়ে প্রয়োজন"),
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />
      <main>
        <HomeHero />

        {/* Metrics strip */}
        <section className="section-blend">
          <dl className="container-page grid grid-cols-2 divide-border py-6 lg:grid-cols-4 lg:divide-x">
            {metrics.map((m) => (
              <div key={m.label} className="flex items-center gap-3 px-2 py-3 lg:justify-center">
                <m.icon className="h-7 w-7 shrink-0 text-primary" strokeWidth={1.6} />
                <div className="min-w-0">
                  <dt className="text-xl font-extrabold tabular-nums text-foreground">{m.value}</dt>
                  <dd className="text-xs text-muted-foreground sm:text-sm">{m.label}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <FourSystems />
        <JourneySection />
        <WhyAnthetic />

        {/* Pricing preview */}
        <section id="automations" className="glow-blend py-20 sm:py-28">
          <div className="container-page">
            <Reveal className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <span className="eyebrow">{t("Pricing", "মূল্য")}</span>
                <h2 className="h-section mt-4">
                  {t("Pick the moment you want covered.", "কোন মুহূর্তটি কভার করতে চান বেছে নিন।")}
                </h2>
                <p className="lead mt-4">
                  {t(
                    "Each system runs on its own subscription, so you start with the one costing you the most today.",
                    "প্রতিটি সিস্টেম আলাদা সাবস্ক্রিপশনে চলে, তাই আজ যেটিতে সবচেয়ে বেশি ক্ষতি হচ্ছে সেটি দিয়েই শুরু করুন।",
                  )}
                </p>
              </div>
              <div
                className="grid grid-cols-2 rounded-full border border-border bg-card p-1 shadow-soft"
                role="group"
                aria-label={t("Billing interval", "বিলিং সময়কাল")}
              >
                <Button
                  variant={!yearly ? "hero" : "ghost"}
                  size="sm"
                  className="rounded-full"
                  aria-pressed={!yearly}
                  onClick={() => setYearly(false)}
                >
                  {t("Monthly", "মাসিক")}
                </Button>
                <Button
                  variant={yearly ? "hero" : "ghost"}
                  size="sm"
                  className="rounded-full"
                  aria-pressed={yearly}
                  onClick={() => setYearly(true)}
                >
                  {t("Yearly · save more", "বার্ষিক · বেশি সাশ্রয়")}
                </Button>
              </div>
            </Reveal>

            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <article key={item.slug} className="surface-card lift flex flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-primary">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-extrabold tracking-tight">{item.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-body">{item.description}</p>
                  <ul className="mt-5 space-y-2 text-sm text-body">
                    {item.features.slice(0, 3).map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-5">
                    <div>
                      <span className="text-2xl font-extrabold tabular-nums text-foreground">
                        {money(item.monthlyOf(yearly))}
                      </span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                      {yearly && (
                        <p className="text-xs text-muted-foreground">
                          {money(item.yearlyPrice)} {t("billed yearly", "বার্ষিক বিল")}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" asChild>
                      <Link to="/automations/$slug" params={{ slug: item.slug }}>
                        {t("Details", "বিস্তারিত")} <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              {t(
                "Prices are read live from the AntheticPlus price matrix — the same table our team edits, so what you see is what you are billed.",
                "মূল্য সরাসরি AntheticPlus প্রাইস ম্যাট্রিক্স থেকে আসে — আমাদের টিম যে টেবিল সম্পাদনা করে, তাই যা দেখছেন তা-ই বিল হবে।",
              )}{" "}
              <Link to="/checkout" className="font-semibold text-primary hover:underline">
                {t("See full pricing", "সম্পূর্ণ মূল্য দেখুন")}
              </Link>
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="section-blend py-20 sm:py-28">
          <div className="container-page">
            <Reveal className="max-w-2xl">
              <span className="eyebrow">{t("Deployment", "ডিপ্লয়মেন্ট")}</span>
              <h2 className="h-section mt-4">
                {t(
                  "From order to first answered call.",
                  "অর্ডার থেকে প্রথম উত্তর দেওয়া কল পর্যন্ত।",
                )}
              </h2>
            </Reveal>
            <ol className="mt-12 grid gap-5 lg:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="surface-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">
                      {index + 1}
                    </span>
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-body">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why us */}
        <section className="py-20 sm:py-28">
          <div className="container-page grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <Reveal>
              <span className="eyebrow">{t("Why AntheticPlus", "কেন AntheticPlus")}</span>
              <h2 className="h-section mt-4">
                {t("Automation you can actually audit.", "এমন অটোমেশন যা সত্যিই যাচাই করা যায়।")}
              </h2>
              <p className="lead mt-4">
                {t(
                  "Most AI tools hand you a chat window. We hand you a system with a contract: a domain lock, a written transcript, a usage ledger and a renewal calendar you can see from your own dashboard.",
                  "বেশিরভাগ AI টুল শুধু একটি চ্যাট উইন্ডো দেয়। আমরা দিই চুক্তিসহ একটি সিস্টেম: ডোমেইন লক, লিখিত ট্রান্সক্রিপ্ট, ব্যবহারের হিসাব ও নবায়নের ক্যালেন্ডার — সবই আপনার ড্যাশবোর্ডে।",
                )}
              </p>
              <Button variant="hero" size="lg" className="mt-8" asChild>
                <Link to="/auth">
                  {t("Create your account", "অ্যাকাউন্ট খুলুন")} <ArrowRight />
                </Link>
              </Button>
            </Reveal>
            <div className="space-y-4">
              {reasons.map((reason) => (
                <div key={reason.title} className="surface-card lift flex gap-4 p-6">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                    <reason.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold">{reason.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-body">{reason.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <ReadinessReport />

        {/* FAQ */}
        <section className="py-20 sm:py-24">
          <div className="container-page max-w-4xl">
            <span className="eyebrow">{t("FAQ", "প্রশ্নোত্তর")}</span>
            <h2 className="h-section mt-4">
              {t("Questions before you order", "অর্ডারের আগে প্রশ্ন")}
            </h2>
            <Accordion type="single" collapsible className="mt-8 surface-card px-6">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={`item-${index}`} className="last:border-b-0">
                  <AccordionTrigger className="text-left text-base font-bold">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-body">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24">
          <div className="container-page">
            <div className="surface-card relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background:var(--hero-glow)]" />
              <div className="relative">
                <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  {t(
                    "Put your first AI system to work this week.",
                    "এই সপ্তাহেই আপনার প্রথম AI সিস্টেম চালু করুন।",
                  )}
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-body">
                  {t(
                    "Open an account, tell us about your business, and submit your first order. A person verifies it, then your automation goes live.",
                    "অ্যাকাউন্ট খুলুন, ব্যবসার কথা জানান এবং প্রথম অর্ডার দিন। একজন মানুষ যাচাই করার পর অটোমেশন চালু হয়।",
                  )}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button variant="hero" size="xl" asChild>
                    <Link to="/auth">
                      {t("Get Started", "শুরু করুন")} <ArrowRight />
                    </Link>
                  </Button>
                  <Button variant="pill" size="xl" asChild>
                    <Link to="/contact">{t("Talk to the team", "টিমের সাথে কথা বলুন")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
