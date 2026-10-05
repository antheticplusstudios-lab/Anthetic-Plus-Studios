import { createFileRoute } from "@tanstack/react-router";
import { Database, FileLock2, KeyRound, Lock, ScrollText, ServerCog, ShieldCheck, Users } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LiftCard, Reveal, StaggerGroup, StaggerItem } from "@/components/motion";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security & Trust — AntheticPlus Studios" },
      {
        name: "description",
        content:
          "How AntheticPlus protects your data: tenant isolation at the database row level, encrypted secrets, zero-retention AI processing and an immutable audit trail.",
      },
      { property: "og:title", content: "Security & Trust — AntheticPlus Studios" },
      {
        property: "og:description",
        content:
          "Tenant isolation, encrypted credentials, zero-retention AI processing and an immutable audit trail on every automation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

const pillars = [
  {
    icon: Database,
    title: "Row-level tenant isolation",
    body: "Every record carries its owner. Access rules are enforced inside the database itself, so one client can never read another client's conversations, leads or billing.",
  },
  {
    icon: Lock,
    title: "Encryption in transit and at rest",
    body: "TLS 1.3 on every connection, AES-256 encryption at rest, and credentials stored in a restricted vault that only administrators can write to and nobody can read back.",
  },
  {
    icon: ServerCog,
    title: "Zero-retention AI processing",
    body: "Conversations are sent to inference providers configured for zero data retention. Nothing your visitors type is used to train a model.",
  },
  {
    icon: KeyRound,
    title: "Signed webhooks & origin locks",
    body: "Outbound webhooks are signed with a per-tenant secret. Widgets only load on the exact domain bound to the account — anywhere else is refused.",
  },
  {
    icon: ScrollText,
    title: "Immutable audit trail",
    body: "Approvals, rejections, provisioning, pricing edits and staff changes are written to an append-only log that cannot be edited or deleted, even by the owner.",
  },
  {
    icon: Users,
    title: "Strict role separation",
    body: "Three tiers: Owner, Partner and Payment Verifier. Verifiers are sandboxed to the verification queue and never see infrastructure, pricing or client records.",
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden px-4 py-20 sm:px-6">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <Reveal className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Trust centre
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
              Built so your customer data never leaves its lane
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Every automation runs inside a tenant boundary enforced by the database, not by application code that can
              be bypassed.
            </p>
          </Reveal>
        </section>

        <section id="isolation" className="px-4 pb-20 sm:px-6">
          <StaggerGroup className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => (
              <StaggerItem key={p.title}>
                <LiftCard className="h-full">
                  <div className="h-full rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
                    <p.icon className="h-5 w-5 text-primary" />
                    <h2 className="mt-4 text-lg font-bold">{p.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                </LiftCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        <section id="data" className="border-y border-border bg-card/40 px-4 py-16 sm:px-6">
          <Reveal className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-black tracking-tight">Data handling</h2>
            <dl className="mt-6 space-y-5 text-sm">
              {[
                ["What we store", "Company profile, billing records, automation configuration, conversation transcripts and captured leads."],
                ["What we never store", "Card numbers, bank credentials or provider API keys in plain text."],
                ["Retention", "Transcripts and usage logs are retained while the subscription is active and removed on request."],
                ["Your rights", "Export or deletion of all tenant data on request, fulfilled within 30 days."],
                ["Sub-processors", "Managed cloud database and hosting, plus the AI inference providers powering replies."],
              ].map(([term, desc]) => (
                <div key={term} className="rounded-xl border border-border bg-background/60 p-4">
                  <dt className="font-bold text-foreground">{term}</dt>
                  <dd className="mt-1 text-muted-foreground">{desc}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section id="audit" className="px-4 py-16 sm:px-6">
          <Reveal className="mx-auto max-w-3xl">
            <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <FileLock2 className="h-5 w-5 text-primary" /> Audit log specification
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Each entry records who acted, what they acted on, the exact time, and the details of the change. Updates
              and deletions are blocked at the database level, so the history is permanent.
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "payment.approved / payment.rejected",
                "automation.provisioned",
                "pricing.updated",
                "invite.accepted",
                "assistant_query",
                "database.wiped",
              ].map((a) => (
                <li key={a} className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono text-xs">
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted-foreground">
              Found a problem?{" "}
              <a
                className="font-semibold text-primary"
                href="mailto:antheticplusstudios@gmail.com?subject=Vulnerability%20disclosure"
              >
                Report it privately
              </a>{" "}
              and we will respond within one business day.
            </p>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
