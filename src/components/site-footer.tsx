import { Link } from "@tanstack/react-router";
import { Activity, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { HomeBrand } from "@/components/home-brand";
import { Reveal } from "@/components/motion";

const suite = [
  { label: "AI Receptionist", to: "/automations/$slug", slug: "ai-receptionist" },
  { label: "Lead Reactivation", to: "/automations/$slug", slug: "lead-reactivation" },
  { label: "Social DM Assistant", to: "/automations/$slug", slug: "social-dm" },
  { label: "Review Engine", to: "/automations/$slug", slug: "review-engine" },
] as const;

function UtcClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{now ? `${now} UTC` : "—"}</span>;
}

export function StatusPill() {
  return (
    <Link
      to="/status"
      className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/20 dark:text-success"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      99.98% Operational
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-card/60 px-4 py-14 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <Reveal className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <HomeBrand />
            <p className="max-w-xs text-sm text-muted-foreground">
              Autonomous front-office systems for businesses that never want to miss a customer.
            </p>
            <StatusPill />
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
                <Lock className="h-3 w-3" /> TLS 1.3
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
                <ShieldCheck className="h-3 w-3" /> AES-256 vault
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
                <Sparkles className="h-3 w-3" /> Zero-retention AI
              </span>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground">Autonomous suite</p>
            <ul className="space-y-2 text-muted-foreground">
              {suite.map((s) => (
                <li key={s.slug}>
                  <Link
                    to="/automations/$slug"
                    params={{ slug: s.slug }}
                    className="transition-colors hover:text-primary"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/" hash="automations" className="transition-colors hover:text-primary">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground">Trust &amp; governance</p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <Link to="/security" className="transition-colors hover:text-primary">
                  Security overview
                </Link>
              </li>
              <li>
                <Link to="/security" hash="data" className="transition-colors hover:text-primary">
                  Data handling &amp; GDPR
                </Link>
              </li>
              <li>
                <Link to="/security" hash="isolation" className="transition-colors hover:text-primary">
                  Tenant isolation
                </Link>
              </li>
              <li>
                <Link to="/security" hash="audit" className="transition-colors hover:text-primary">
                  Audit log specification
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground">Platform</p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <Link to="/status" className="transition-colors hover:text-primary">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" /> System status
                  </span>
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="transition-colors hover:text-primary">
                  Client dashboard
                </Link>
              </li>
              <li>
                <a
                  href="mailto:antheticplusstudios@gmail.com"
                  className="transition-colors hover:text-primary"
                >
                  Talk to the team
                </a>
              </li>
              <li>
                <a
                  href="mailto:antheticplusstudios@gmail.com?subject=Vulnerability%20disclosure"
                  className="transition-colors hover:text-primary"
                >
                  Vulnerability disclosure
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} <span className="font-semibold text-foreground">AntheticPlus Studios</span>{" "}
            &middot; Founded by Smyight
          </p>
          <p className="flex items-center gap-4">
            <span>
              Server time <UtcClock />
            </span>
            <a className="font-semibold text-primary" href="mailto:antheticplusstudios@gmail.com">
              antheticplusstudios@gmail.com
            </a>
          </p>
        </div>
      </Reveal>
    </footer>
  );
}
