import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Gauge,
  Layers,
  LineChart,
  Quote,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { livePricingQueryOptions, storefrontItems } from "@/lib/pricing";
import { money } from "@/components/admin-ui";
import { AssistantConsole } from "@/components/assistant/assistant-console";

export const Route = createFileRoute("/")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(livePricingQueryOptions),
  head: () => ({
    meta: [
      { title: "AntheticPlus Studios — AI Automations That Work Every Hour You Don't" },
      {
        name: "description",
        content:
          "Six production-ready AI systems that answer calls and messages, qualify leads, book appointments, support customers and collect reviews — deployed to your domain in days.",
      },
      { property: "og:title", content: "AntheticPlus Studios — AI Automations That Work Every Hour You Don't" },
      {
        property: "og:description",
        content:
          "Deploy intelligent systems that answer, qualify, book, support, recover and grow your business around the clock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const proof = [
  { value: "24/7", label: "Coverage, no shifts to fill" },
  { value: "<60s", label: "Median first reply" },
  { value: "6", label: "Production systems" },
  { value: "0", label: "Cards or gateways required" },
];

const steps = [
  {
    icon: Layers,
    title: "Pick the system",
    body: "Choose one focused automation or a connected stack. Every system is already built, tested and running for real businesses.",
  },
  {
    icon: Sparkles,
    title: "Give it your business",
    body: "Paste your services, hours, pricing and policies into the onboarding form. That context becomes the guardrail your AI never leaves.",
  },
  {
    icon: ShieldCheck,
    title: "Locked to your domain",
    body: "We bind one client ID to one domain and hand you a single script tag. Nothing works anywhere else, and nothing is shared between clients.",
  },
];

const reasons = [
  {
    icon: Gauge,
    title: "Built on infrastructure you can trust",
    body: "A rotating model pool with automatic failover and a live record of every rate-limit event, so one provider hiccup never silences your front desk.",
  },
  {
    icon: LineChart,
    title: "Every conversation is a record",
    body: "Transcripts, token usage and lead counts stay attached to your automation, so you can see exactly what the system handled and what it cost.",
  },
  {
    icon: Timer,
    title: "Renewals that never surprise you",
    body: "Day 25 you get a warning, not a shutdown. Grace periods are explicit, and an admin can extend them the moment something slips.",
  },
];

const faqs = [
  {
    q: "Do I need a credit card or payment gateway?",
    a: "No. Orders are paid by bank transfer, crypto or mobile money. You submit the transaction reference, a human verifies it, and your automation is activated with the exact expiry date on the order.",
  },
  {
    q: "How fast is my automation live?",
    a: "Once payment is approved we provision your client ID, bind it to your domain and hand you the embed script the same day. Most clients are answering customers within a few hours.",
  },
  {
    q: "What happens if my subscription lapses?",
    a: "You get a warning five days before expiry, then a grace window, then the system stops answering on your site. Nothing is deleted, so reconnecting takes one payment.",
  },
  {
    q: "Can the AI say anything it wants?",
    a: "No. Your business context plus a global safety baseline decide what it may claim. It never invents prices, availability or legal and medical advice, and it escalates when unsure.",
  },
  {
    q: "Which channels does each system cover?",
    a: "Voice and SMS, website chat, WhatsApp, Instagram and Messenger, with each system sold on its own so you only pay for what you use.",
  },
];

function Index() {
  const { data: plans } = useSuspenseQuery(livePricingQueryOptions);
  // Homepage showcases only these two; all other automations stay fully active in dashboards/admin.
  const items = storefrontItems(plans);
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />
      <main className="page-enter -mt-20">
        {/* Hero */}
        <section className="relative border-b border-border px-4 pb-20 pt-32 sm:px-6 sm:pb-28 sm:pt-40">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_-10%,color-mix(in_oklab,var(--primary)_20%,transparent),transparent_45%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> AI workforce systems for growing businesses
              </span>
              <h1 className="mt-6 max-w-4xl text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl lg:text-[4.4rem]">
                The hire that never
                <br />
                <span className="text-primary">clocks out.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                AntheticPlus builds focused AI systems that answer, qualify, book, support, recover and review — on your
                domain, in your voice, with a written record of everything they did.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <a href="#automations">
                    Explore automations <ArrowRight />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">Open a client account</Link>
                </Button>
              </div>
              <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
                {proof.map((item) => (
                  <div key={item.label}>
                    <dt className="text-2xl font-extrabold tabular-nums tracking-tight">{item.value}</dt>
                    <dd className="mt-1 text-xs leading-4 text-muted-foreground">{item.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Interactive AI receptionist */}
            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/5 blur-2xl" />
              <AssistantConsole />
            </div>
          </div>
        </section>

        {/* Automations */}
        <section id="automations" className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-sm font-bold uppercase tracking-wide text-primary">Flagship systems</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
                  Pick the moment you want covered.
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Each system runs on its own subscription, so you start with the one costing you the most money today.
                </p>
              </div>
              <div className="grid grid-cols-2 rounded-full border border-border bg-card p-1">
                <Button variant={!yearly ? "default" : "ghost"} size="sm" onClick={() => setYearly(false)}>
                  Monthly
                </Button>
                <Button variant={yearly ? "default" : "ghost"} size="sm" onClick={() => setYearly(true)}>
                  Yearly · save more
                </Button>
              </div>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <article
                  key={item.slug}
                  className="group flex min-h-[400px] flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-extrabold tracking-tight">{item.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {item.features.slice(0, 3).map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-end justify-between border-t border-border pt-5">
                    <div>
                      <span className="text-2xl font-extrabold tabular-nums">{money(item.monthlyOf(yearly))}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                      {yearly && (
                        <p className="text-xs text-muted-foreground">{money(item.yearlyPrice)} billed yearly</p>
                      )}
                    </div>
                    <Button variant="outline" asChild>
                      <Link to="/automations/$slug" params={{ slug: item.slug }}>
                        Details <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Prices are read live from the AntheticPlus price matrix — the same table our admin team edits, so what you
              see is what you are billed.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border bg-card/50 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-wide text-primary">Deployment</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                From order to first answered call.
              </h2>
            </div>
            <ol className="mt-12 grid gap-5 lg:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">
                      {index + 1}
                    </span>
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why us */}
        <section className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-primary">Why AntheticPlus</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Automation you can actually audit.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Most AI tools hand you a chat window. We hand you a system with a contract: a domain lock, a written
                transcript, a usage ledger and a renewal calendar you can see from your own dashboard.
              </p>
              <Button className="mt-8" asChild>
                <Link to="/auth">
                  Create your account <ArrowRight />
                </Link>
              </Button>
            </div>
            <div className="space-y-4">
              {reasons.map((reason) => (
                <div key={reason.title} className="flex gap-4 rounded-2xl border border-border bg-card p-6">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <reason.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold">{reason.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{reason.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Proof / voice */}
        <section className="border-y border-border bg-card/50 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <Quote className="h-8 w-8 text-primary/60" />
            <blockquote className="mt-5 text-2xl font-bold leading-relaxed tracking-tight sm:text-3xl">
              “We stopped losing after-hours enquiries the week the receptionist went live. The transcripts are the part
              our team actually trusts — we can read exactly what was promised to the patient.”
            </blockquote>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="h-4 w-4 text-primary" />
              Operations lead, multi-location clinic group · Voice &amp; SMS Receptionist
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Questions before you order</h2>
            <Accordion type="single" collapsible className="mt-8">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={`item-${index}`}>
                  <AccordionTrigger className="text-left font-bold">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-primary/20 bg-secondary px-6 py-14 text-center sm:px-12">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Put your first AI system to work this week.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Open an account, tell us about your business, and submit your first order. Verification is manual and
              personal — a person checks it, then your automation goes live.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/auth">
                  Get started <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="mailto:antheticplusstudios@gmail.com">Talk to the team</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
