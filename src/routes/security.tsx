import { useT } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import {
  Database,
  FileLock2,
  KeyRound,
  Lock,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LiftCard, Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Hero3D } from "@/components/hero-3d";

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
    title: [
      "Row-level tenant isolation",
      "ডেটাবেসের সারি পর্যায়ে ক্লায়েন্টের ডেটা পৃথকীকরণ",
    ] as const,
    body: [
      "Every record carries its owner. Access rules are enforced inside the database itself, so one client can never read another client's conversations, leads or billing.",
      "প্রতিটি রেকর্ডের মালিক নির্ধারিত থাকে। ডেটাবেসের ভেতরেই প্রবেশাধিকার নিয়ন্ত্রিত হয়, তাই কোনো ক্লায়েন্ট অন্য ক্লায়েন্টের কথোপকথন, সম্ভাব্য গ্রাহক বা বিলিং তথ্য দেখতে পারেন না।",
    ] as const,
  },
  {
    icon: Lock,
    title: ["Encryption in transit and at rest", "আদান-প্রদান ও সংরক্ষণে এনক্রিপশন"] as const,
    body: [
      "TLS 1.3 on every connection, AES-256 encryption at rest, and credentials stored in a restricted vault that only administrators can write to and nobody can read back.",
      "প্রতিটি সংযোগে TLS 1.3 এবং সংরক্ষিত ডেটায় AES-256 এনক্রিপশন ব্যবহৃত হয়। গোপন তথ্য সীমিত প্রবেশাধিকারের ভল্টে রাখা হয়, যেখানে শুধু প্রশাসকেরা লিখতে পারেন, কিন্তু কেউ পড়ে নিতে পারেন না।",
    ] as const,
  },
  {
    icon: ServerCog,
    title: ["Zero-retention AI processing", "ডেটা সংরক্ষণ ছাড়া AI প্রক্রিয়াকরণ"] as const,
    body: [
      "Conversations are sent to inference providers configured for zero data retention. Nothing your visitors type is used to train a model.",
      "কথোপকথন এমন ইনফারেন্স প্রদানকারীদের কাছে পাঠানো হয় যাদের ডেটা সংরক্ষণ বন্ধ রাখা হয়েছে। আপনার দর্শকদের লেখা কোনো তথ্য মডেল প্রশিক্ষণে ব্যবহৃত হয় না।",
    ] as const,
  },
  {
    icon: KeyRound,
    title: ["Signed webhooks & origin locks", "স্বাক্ষরিত ওয়েবহুক ও উৎস লক"] as const,
    body: [
      "Outbound webhooks are signed with a per-tenant secret. Widgets only load on the exact domain bound to the account — anywhere else is refused.",
      "বহির্গামী ওয়েবহুক প্রতিটি ক্লায়েন্টের নিজস্ব গোপন কী দিয়ে স্বাক্ষরিত হয়। উইজেট শুধু অ্যাকাউন্টের সঙ্গে যুক্ত নির্দিষ্ট ডোমেইনেই লোড হয়—অন্য কোথাও অনুমতি দেওয়া হয় না।",
    ] as const,
  },
  {
    icon: ScrollText,
    title: ["Immutable audit trail", "অপরিবর্তনীয় অডিট রেকর্ড"] as const,
    body: [
      "Approvals, rejections, provisioning, pricing edits and staff changes are written to an append-only log that cannot be edited or deleted, even by the owner.",
      "অনুমোদন, প্রত্যাখ্যান, সেবা চালু, মূল্য সম্পাদনা ও কর্মী পরিবর্তন শুধু নতুন তথ্য যোগ করা যায় এমন লগে লেখা হয়। এমনকি মালিকও তা সম্পাদনা বা মুছতে পারেন না।",
    ] as const,
  },
  {
    icon: Users,
    title: ["Strict role separation", "দায়িত্বের কঠোর পৃথকীকরণ"] as const,
    body: [
      "Three tiers: Owner, Partner and Payment Verifier. Verifiers are sandboxed to the verification queue and never see infrastructure, pricing or client records.",
      "তিনটি স্তর: মালিক, অংশীদার ও পেমেন্ট যাচাইকারী। যাচাইকারীদের প্রবেশাধিকার শুধু যাচাইয়ের সারিতে সীমিত; অবকাঠামো, মূল্য বা ক্লায়েন্টের রেকর্ড তাঁরা দেখতে পান না।",
    ] as const,
  },
];

export default function SecurityPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden px-4 py-20 sm:px-6">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <Hero3D />
          <Reveal className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />{" "}
              {t("Trust centre", "আস্থা কেন্দ্র")}
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
              {t(
                "Built so your customer data never leaves its lane",
                "আপনার গ্রাহকের ডেটা নির্ধারিত সীমানায় সুরক্ষিত রাখার জন্য তৈরি",
              )}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {t(
                "Every automation runs inside a tenant boundary enforced by the database, not by application code that can be bypassed.",
                "প্রতিটি অটোমেশন ডেটাবেস দ্বারা নিয়ন্ত্রিত ক্লায়েন্টের নিজস্ব সীমানায় চলে, পাশ কাটানো সম্ভব এমন অ্যাপ্লিকেশন কোডের ওপর নির্ভর করে না।",
              )}
            </p>
          </Reveal>
        </section>

        <section id="isolation" className="px-4 pb-20 sm:px-6">
          <StaggerGroup className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => (
              <StaggerItem key={p.title[0]}>
                <LiftCard className="h-full">
                  <div className="h-full rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
                    <p.icon className="h-5 w-5 text-primary" />
                    <h2 className="mt-4 text-lg font-bold">{t(p.title[0], p.title[1])}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {t(p.body[0], p.body[1])}
                    </p>
                  </div>
                </LiftCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        <section id="data" className="border-y border-border bg-card/40 px-4 py-16 sm:px-6">
          <Reveal className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-black tracking-tight">
              {t("Data handling", "ডেটা ব্যবস্থাপনা")}
            </h2>
            <dl className="mt-6 space-y-5 text-sm">
              {[
                [
                  t("What we store", "আমরা যা সংরক্ষণ করি"),
                  t(
                    "Company profile, billing records, automation configuration, conversation transcripts and captured leads.",
                    "প্রতিষ্ঠানের প্রোফাইল, বিলিং রেকর্ড, অটোমেশনের কনফিগারেশন, কথোপকথনের প্রতিলিপি ও সংগৃহীত সম্ভাব্য গ্রাহকের তথ্য।",
                  ),
                ],
                [
                  t("What we never store", "আমরা যা কখনো সংরক্ষণ করি না"),
                  t(
                    "Card numbers, bank credentials or provider API keys in plain text.",
                    "কার্ড নম্বর, ব্যাংকের গোপন তথ্য বা প্রদানকারীর API কী সাধারণ পাঠ্য আকারে।",
                  ),
                ],
                [
                  t("Retention", "সংরক্ষণের মেয়াদ"),
                  t(
                    "Transcripts and usage logs are retained while the subscription is active and removed on request.",
                    "সাবস্ক্রিপশন সক্রিয় থাকা পর্যন্ত প্রতিলিপি ও ব্যবহারের লগ রাখা হয় এবং অনুরোধে মুছে দেওয়া হয়।",
                  ),
                ],
                [
                  t("Your rights", "আপনার অধিকার"),
                  t(
                    "Export or deletion of all tenant data on request, fulfilled within 30 days.",
                    "অনুরোধের ৩০ দিনের মধ্যে ক্লায়েন্টের সব ডেটা রপ্তানি বা মুছে দেওয়া হয়।",
                  ),
                ],
                [
                  t("Sub-processors", "সহযোগী প্রক্রিয়াকারী"),
                  t(
                    "Managed cloud database and hosting, plus the AI inference providers powering replies.",
                    "পরিচালিত ক্লাউড ডেটাবেস ও হোস্টিং এবং উত্তর তৈরির AI ইনফারেন্স প্রদানকারীরা।",
                  ),
                ],
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
              <FileLock2 className="h-5 w-5 text-primary" />{" "}
              {t("Audit log specification", "অডিট লগের বিবরণ")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Each entry records who acted, what they acted on, the exact time, and the details of the change. Updates and deletions are blocked at the database level, so the history is permanent.",
                "প্রতিটি এন্ট্রিতে কে কাজ করেছেন, কী নিয়ে কাজ করেছেন, সঠিক সময় ও পরিবর্তনের বিবরণ থাকে। ডেটাবেস পর্যায়ে সম্পাদনা ও মুছে ফেলা বন্ধ থাকায় ইতিহাস স্থায়ী থাকে।",
              )}
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
                <li
                  key={a}
                  className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono text-xs"
                >
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted-foreground">
              {t("Found a problem?", "কোনো সমস্যা পেয়েছেন?")}{" "}
              <a
                className="font-semibold text-primary"
                href="mailto:antheticplusstudios@gmail.com?subject=Vulnerability%20disclosure"
              >
                {t("Report it privately", "গোপনে জানান")}
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
