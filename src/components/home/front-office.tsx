import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Database,
  GitBranch,
  MessagesSquare,
  PhoneCall,
  ShieldCheck,
  Target,
  UserCheck,
} from "lucide-react";
import { getSystemStatus } from "@/lib/status.functions";
import { livePricingQueryOptions, withLivePricing } from "@/lib/pricing";
import { useT } from "@/lib/i18n";

const SYSTEMS = [
  {
    slug: "voice-sms-receptionist",
    icon: PhoneCall,
    name: "Voice & SMS Receptionist",
    flow: [
      ["Answers calls", "কল ধরে"],
      ["Texts back", "এসএমএস পাঠায়"],
      ["Books", "বুক করে"],
      ["Escalates", "হস্তান্তর করে"],
    ],
  },
  {
    slug: "lead-capture-qualifier",
    icon: Target,
    name: "Lead Capture & Qualifier",
    flow: [
      ["Captures", "তথ্য নেয়"],
      ["Qualifies", "যাচাই করে"],
      ["Scores", "স্কোর দেয়"],
      ["Routes", "রাউট করে"],
    ],
  },
  {
    slug: "knowledge-base-support",
    icon: BookOpen,
    name: "Knowledge Base Support",
    flow: [
      ["Learns your docs", "ডকস শেখে"],
      ["Answers", "উত্তর দেয়"],
      ["Cites", "সূত্র দেয়"],
      ["Hands off", "হস্তান্তর করে"],
    ],
  },
  {
    slug: "social-dm-assistant",
    icon: MessagesSquare,
    name: "Social DM Assistant",
    flow: [
      ["Handles DMs", "ডিএম সামলায়"],
      ["Answers", "উত্তর দেয়"],
      ["Qualifies", "যাচাই করে"],
      ["Routes", "রাউট করে"],
    ],
  },
] as const;

export function FourSystems() {
  const t = useT();
  const { data: plans } = useSuspenseQuery(livePricingQueryOptions);
  const visible = new Set(
    withLivePricing(plans)
      .filter((item) => item.listed)
      .map((item) => item.slug),
  );
  const systems = SYSTEMS.filter((s) => visible.has(s.slug));
  return (
    <section className="py-16 sm:py-20">
      <div className="container-page">
        <span className="eyebrow">{t("Products", "প্রোডাক্ট")}</span>
        <h2 className="h-section mt-4 max-w-3xl">
          {t(
            "Focused systems. Each runs on its own. Together they cover your front desk.",
            "নির্দিষ্ট সিস্টেম। প্রতিটি নিজে চলে। একসাথে পুরো ফ্রন্ট ডেস্ক সামলায়।",
          )}
        </h2>
        <p className="lead mt-4 max-w-2xl">
          {t(
            "We don't sell a generic chatbot. Each system is configured for one job, monitored while it runs, and hands off to your team when a person is needed.",
            "আমরা সাধারণ চ্যাটবট বিক্রি করি না। প্রতিটি সিস্টেম একটি কাজের জন্য কনফিগার করা, চলার সময় মনিটর করা, এবং প্রয়োজনে আপনার টিমে হস্তান্তর করে।",
          )}
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {systems.map((s) => (
            <Link
              key={s.slug}
              to="/automations/$slug"
              params={{ slug: s.slug }}
              className="group surface-card lift p-6"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-extrabold">{s.name}</h3>
              </div>
              <ol className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                {s.flow.map(([fe, fb], i) => (
                  <li key={fe} className="flex items-center gap-2">
                    <span className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-body">
                      {t(fe, fb)}
                    </span>
                    {i < s.flow.length - 1 && (
                      <span aria-hidden className="text-primary">
                        →
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const JOURNEY = [
  ["Discover", "খুঁজে দেখুন"],
  ["Choose automation", "অটোমেশন বাছুন"],
  ["Configure", "কনফিগার করুন"],
  ["Verify payment", "পেমেন্ট যাচাই"],
  ["Activate", "চালু করুন"],
  ["Monitor", "মনিটর করুন"],
] as const;

export function JourneySection() {
  const t = useT();
  return (
    <section className="bg-surface py-16 sm:py-20">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">
            {t("Always on, wherever your customers are", "গ্রাহক যেখানেই থাকুন, সবসময় চালু")}
          </span>
          <h2 className="h-section mt-4">
            {t(
              "From first visit to a monitored system",
              "প্রথম ভিজিট থেকে মনিটর করা সিস্টেম পর্যন্ত",
            )}
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {JOURNEY.map(([je, jb], i) => (
              <li key={je} className="flex items-center gap-4 surface-card p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/40 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <span className="font-semibold">{t(je, jb)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">
            {t(
              "Payment is checked by a person, not assumed. Your system goes through testing before it is switched on.",
              "পেমেন্ট একজন মানুষ যাচাই করেন, ধরে নেওয়া হয় না। চালুর আগে আপনার সিস্টেম পরীক্ষা করা হয়।",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

const WHY: { icon: typeof Activity; t: [string, string]; b: [string, string] }[] = [
  {
    icon: Activity,
    t: ["Real deployments, real state", "আসল ডিপ্লয়মেন্ট, আসল অবস্থা"],
    b: [
      "Every system has a live status: testing, active, paused or expired. You see the same state our team sees.",
      "প্রতিটি সিস্টেমের লাইভ স্ট্যাটাস আছে: টেস্টিং, সক্রিয়, বিরতি বা মেয়াদোত্তীর্ণ। আমাদের টিম যা দেখে আপনিও তা-ই দেখেন।",
    ],
  },
  {
    icon: GitBranch,
    t: ["AI provider failover", "AI প্রোভাইডার ফেইলওভার"],
    b: [
      "Requests rotate across several AI providers. If one fails, the next takes over automatically.",
      "অনুরোধগুলো কয়েকটি AI প্রোভাইডারে ঘোরে। একটি ব্যর্থ হলে পরেরটি স্বয়ংক্রিয়ভাবে দায়িত্ব নেয়।",
    ],
  },
  {
    icon: ShieldCheck,
    t: ["Locked to your domain", "আপনার ডোমেইনে লক"],
    b: [
      "Each deployment is tied to your website and kept separate from every other client.",
      "প্রতিটি ডিপ্লয়মেন্ট আপনার ওয়েবসাইটে আবদ্ধ এবং অন্য সব ক্লায়েন্ট থেকে আলাদা।",
    ],
  },
  {
    icon: UserCheck,
    t: ["Human verification & handoff", "মানুষের যাচাই ও হস্তান্তর"],
    b: [
      "People check payments, and your team gets the conversation when the AI shouldn't answer.",
      "মানুষ পেমেন্ট যাচাই করেন, আর AI-এর উত্তর দেওয়া উচিত না হলে কথোপকথন আপনার টিম পায়।",
    ],
  },
  {
    icon: Database,
    t: ["Separated data", "আলাদা ডেটা"],
    b: [
      "Identity, billing, AI and customer conversations live in four separate databases.",
      "পরিচয়, বিলিং, AI ও গ্রাহক কথোপকথন চারটি আলাদা ডাটাবেসে থাকে।",
    ],
  },
  {
    icon: BadgeCheck,
    t: ["Transparent billing & analytics", "স্বচ্ছ বিলিং ও অ্যানালিটিক্স"],
    b: [
      "Clear expiry dates, no hidden renewals, and real counts of runs, leads and conversations.",
      "স্পষ্ট মেয়াদ, লুকানো নবায়ন নেই, এবং রান, লিড ও কথোপকথনের আসল হিসাব।",
    ],
  },
];

export function WhyAnthetic() {
  const t = useT();
  return (
    <section className="py-16 sm:py-20">
      <div className="container-page">
        <span className="eyebrow">{t("Why AntheticPlus?", "কেন AntheticPlus?")}</span>
        <h2 className="h-section mt-4 max-w-3xl">
          {t("Built like infrastructure, not a widget.", "উইজেট নয়, অবকাঠামোর মতো তৈরি।")}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((w) => (
            <div key={w.t[0]} className="surface-card lift p-6">
              <w.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-extrabold">{t(w.t[0], w.t[1])}</h3>
              <p className="mt-2 text-sm leading-6 text-body">{t(w.b[0], w.b[1])}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const LAYERS = [
  { key: "db1", label: "Identity", bn: "পরিচয়" },
  { key: "db2", label: "Billing & deployments", bn: "বিলিং ও ডিপ্লয়মেন্ট" },
  { key: "db3", label: "AI", bn: "AI" },
  { key: "db4", label: "CRM & execution", bn: "CRM ও এক্সিকিউশন" },
] as const;

/** Readiness report backed by the live status check. Shows only up/down + latency — never secrets. */
export function ReadinessReport() {
  const t = useT();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-status"],
    queryFn: () => getSystemStatus(),
    staleTime: 60_000,
    retry: false,
  });
  const cell = (ok: boolean | undefined, sub?: string) => (
    <span
      className={`text-xs font-semibold ${ok ? "text-success" : ok === false ? "text-destructive" : "text-muted-foreground"}`}
    >
      {isLoading
        ? t("Checking…", "যাচাই হচ্ছে…")
        : isError || ok === undefined
          ? t("Unavailable", "পাওয়া যাচ্ছে না")
          : ok
            ? t("Operational", "সচল")
            : t("Degraded", "সমস্যাযুক্ত")}
      {sub && ok ? <span className="ml-1 font-normal text-muted-foreground">{sub}</span> : null}
    </span>
  );
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-24">
      <div className="mx-auto max-w-4xl surface-card p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-extrabold">
            {t("Live readiness report", "লাইভ রেডিনেস রিপোর্ট")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {data
              ? `${t("Checked", "যাচাই")} ${new Date(data.checkedAt).toLocaleTimeString()}`
              : ""}
          </span>
        </div>
        <ul className="mt-6 divide-y divide-border">
          {LAYERS.map((l) => {
            const d = data?.database.domains[l.key];
            return (
              <li key={l.key} className="flex items-center justify-between py-3 text-sm">
                <span className="font-semibold">{t(l.label, l.bn)}</span>
                {cell(d?.ok, d ? `${d.latencyMs} ms` : undefined)}
              </li>
            );
          })}
          <li className="flex items-center justify-between py-3 text-sm">
            <span className="font-semibold">
              {t("AI provider failover", "AI প্রোভাইডার ফেইলওভার")}
            </span>
            {cell(data?.inference.ok)}
          </li>
          <li className="flex items-center justify-between py-3 text-sm">
            <span className="font-semibold">
              {t("Monitoring & execution API", "মনিটরিং ও এক্সিকিউশন API")}
            </span>
            {cell(data?.api.ok)}
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          {t(
            "Results come from a live check each time this page loads.",
            "প্রতিবার পেজ লোড হলে লাইভ চেক থেকে ফলাফল আসে।",
          )}{" "}
          <Link to="/status" className="underline">
            {t("Full status", "সম্পূর্ণ স্ট্যাটাস")}
          </Link>
        </p>
      </div>
    </section>
  );
}
