import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/components/admin-ui";
import type { PricedAutomation } from "@/lib/pricing";

export function AutomationCard({ item, yearly }: { item: PricedAutomation; yearly: boolean }) {
  return (
    <article className="group flex min-h-[400px] flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
          <item.icon className="h-6 w-6" />
        </div>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">{item.badge}</span>
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
          {yearly && <p className="text-xs text-muted-foreground">{money(item.yearlyPrice)} billed yearly</p>}
        </div>
        <Button variant="outline" asChild>
          <Link to="/automations/$slug" params={{ slug: item.slug }}>
            Details <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}
