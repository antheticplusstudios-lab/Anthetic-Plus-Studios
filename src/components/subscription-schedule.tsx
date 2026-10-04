import { CalendarClock, PowerOff, RefreshCcw } from "lucide-react";
import { computePeriod, formatUtc, type BillingCycle } from "@/lib/billing";

export function SubscriptionSchedule({ cycle, start }: { cycle: BillingCycle; start: Date }) {
  const period = computePeriod(cycle, start);
  const rows = [
    { icon: CalendarClock, label: "Period starts", value: formatUtc(period.start) },
    { icon: RefreshCcw, label: `Renews after ${period.days} days`, value: formatUtc(period.end) },
    {
      icon: PowerOff,
      label: "Auto-stop if unpaid",
      value: "Widget disconnects at period end; reactivation restores it instantly",
    },
  ];
  return (
    <ul className="space-y-3 rounded-2xl border border-border bg-card p-5">
      {rows.map((row) => (
        <li key={row.label} className="flex gap-3">
          <row.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">{row.label}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{row.value}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
