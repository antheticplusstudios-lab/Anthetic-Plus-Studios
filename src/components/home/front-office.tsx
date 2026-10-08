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

const SYSTEMS = [
  {
    slug: "voice-sms-receptionist",
    icon: PhoneCall,
    name: "Voice & SMS Receptionist",
    flow: ["Answers calls", "Texts back", "Books", "Escalates"],
  },
  {
    slug: "lead-capture-qualifier",
    icon: Target,
    name: "Lead Capture & Qualifier",
    flow: ["Captures", "Qualifies", "Scores", "Routes"],
  },
  {
    slug: "knowledge-base-support",
    icon: BookOpen,
    name: "Knowledge Base Support",
    flow: ["Learns your docs", "Answers", "Cites", "Hands off"],
  },
  {
    slug: "social-dm-assistant",
    icon: MessagesSquare,
    name: "Social DM Assistant",
    flow: ["Handles DMs", "Answers", "Qualifies", "Routes"],
  },
] as const;

export function FourSystems() {
  const { data: plans } = useSuspenseQuery(livePricingQueryOptions);
  const visible = new Set(
    withLivePricing(plans)
      .filter((item) => item.listed)
      .map((item) => item.slug),
  );
  const systems = SYSTEMS.filter((s) => visible.has(s.slug));
  return (
    <section className="border-b border-border px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-bold text-primary">The Autonomous Front Office</p>
        <h2 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Focused systems. Each runs on its own. Together they cover your front desk.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          We don't sell a generic chatbot. Each system is configured for one job, monitored while it
          runs, and hands off to your team when a person is needed. Buy one, or connect all four.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {systems.map((s) => (
            <Link
              key={s.slug}
              to="/automations/$slug"
              params={{ slug: s.slug }}
              className="group rounded-3xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-extrabold">{s.name}</h3>
              </div>
              <ol className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                {s.flow.map((f, i) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="rounded-full border border-border bg-background px-3 py-1 font-medium">
                      {f}
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
  "Discover",
  "Choose automation",
  "Configure",
  "Verify payment",
  "Activate",
  "Monitor",
];

export function JourneySection() {
  return (
    <section className="border-b border-border bg-card/50 px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-primary">Always on, wherever your customers are</p>
          <h2 className="mt-2 text-4xl font-extrabold tracking-tight">
            From first visit to a monitored system
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {JOURNEY.map((j, i) => (
              <li
                key={j}
                className="flex items-center gap-4 rounded-2xl border border-border bg-background p-4"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/40 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <span className="font-semibold">{j}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">
            Payment is checked by a person, not assumed. Your system goes through testing before it
            is switched on.
          </p>
        </div>
      </div>
    </section>
  );
}

const WHY = [
  {
    icon: Activity,
    t: "Real deployments, real state",
    b: "Every system has a live status: testing, active, paused or expired. You see the same state our team sees.",
  },
  {
    icon: GitBranch,
    t: "AI provider failover",
    b: "Requests rotate across several AI providers. If one fails, the next takes over automatically.",
  },
  {
    icon: ShieldCheck,
    t: "Locked to your domain",
    b: "Each deployment is tied to your website and kept separate from every other client.",
  },
  {
    icon: UserCheck,
    t: "Human verification & handoff",
    b: "People check payments, and your team gets the conversation when the AI shouldn't answer.",
  },
  {
    icon: Database,
    t: "Separated data",
    b: "Identity, billing, AI and customer conversations live in four separate databases.",
  },
  {
    icon: BadgeCheck,
    t: "Transparent billing & analytics",
    b: "Clear expiry dates, no hidden renewals, and real counts of runs, leads and conversations.",
  },
];

export function WhyAnthetic() {
  return (
    <section className="border-b border-border px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-bold text-primary">Why AntheticPlus?</p>
        <h2 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-tight">
          Built like infrastructure, not a widget.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((w) => (
            <div key={w.t} className="rounded-3xl border border-border bg-card p-6">
              <w.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-extrabold">{w.t}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{w.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const LAYERS = [
  { key: "db1", label: "Identity" },
  { key: "db2", label: "Billing & deployments" },
  { key: "db3", label: "AI" },
  { key: "db4", label: "CRM & execution" },
] as const;

/** Readiness report backed by the live status check. Shows only up/down + latency — never secrets. */
export function ReadinessReport() {
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
        ? "Checking…"
        : isError || ok === undefined
          ? "Unavailable"
          : ok
            ? "Operational"
            : "Degraded"}
      {sub && ok ? <span className="ml-1 font-normal text-muted-foreground">{sub}</span> : null}
    </span>
  );
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-extrabold">Live readiness report</h2>
          <span className="text-xs text-muted-foreground">
            {data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()}` : ""}
          </span>
        </div>
        <ul className="mt-6 divide-y divide-border">
          {LAYERS.map((l) => {
            const d = data?.database.domains[l.key];
            return (
              <li key={l.key} className="flex items-center justify-between py-3 text-sm">
                <span className="font-semibold">{l.label}</span>
                {cell(d?.ok, d ? `${d.latencyMs} ms` : undefined)}
              </li>
            );
          })}
          <li className="flex items-center justify-between py-3 text-sm">
            <span className="font-semibold">AI provider failover</span>
            {cell(data?.inference.ok)}
          </li>
          <li className="flex items-center justify-between py-3 text-sm">
            <span className="font-semibold">Monitoring & execution API</span>
            {cell(data?.api.ok)}
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Results come from a live check each time this page loads.{" "}
          <Link to="/status" className="underline">
            Full status
          </Link>
        </p>
      </div>
    </section>
  );
}
