import { useMemo, useState } from "react";
import { Calculator, Clock3, Wallet } from "lucide-react";

const numberFormat = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 1 });
const taka = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });

export function AutomationImpactCalculator() {
  const [tasksPerDay, setTasksPerDay] = useState(25);
  const [minutesPerTask, setMinutesPerTask] = useState(4);
  const [workDays, setWorkDays] = useState(22);
  const [hourlyCost, setHourlyCost] = useState(0);
  const [coverage, setCoverage] = useState(60);
  const estimate = useMemo(() => {
    const manualHours = (tasksPerDay * minutesPerTask * workDays) / 60;
    const recoveredHours = manualHours * (coverage / 100);
    return { manualHours, recoveredHours, labourValue: recoveredHours * hourlyCost };
  }, [tasksPerDay, minutesPerTask, workDays, hourlyCost, coverage]);
  const fields = [
    { label: "Repetitive tasks each day", value: tasksPerDay, set: setTasksPerDay, min: 0, max: 10000 },
    { label: "Minutes spent per task", value: minutesPerTask, set: setMinutesPerTask, min: 0, max: 1440 },
    { label: "Working days each month", value: workDays, set: setWorkDays, min: 1, max: 31 },
    { label: "Staff labour cost per hour (BDT)", value: hourlyCost, set: setHourlyCost, min: 0, max: 1000000 },
  ];
  return (
    <section id="impact" className="py-20 sm:py-28">
      <div className="container-page">
        <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <span className="eyebrow"><Calculator className="mr-2 inline size-3.5" />Estimate the manual workload</span>
            <h2 className="h-section mt-4">See what repetitive work is costing in time.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">Use your own workload and labour figures to estimate the time your team currently spends on repetitive tasks, and how much time could be freed if an automation handled a portion of them.</p>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">This is an illustrative planning estimate, not a guaranteed saving or a quote. Actual automation coverage depends on your workflow, tools, customer needs and human hand-off requirements. Autumic packages are custom-scoped.</p>
          </div>
          <div className="surface-card rounded-3xl p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => <label key={field.label} className="grid gap-2 text-sm font-medium">{field.label}<input type="number" min={field.min} max={field.max} value={field.value} onChange={(e) => field.set(Math.max(field.min, Math.min(field.max, Number(e.target.value) || 0)))} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>)}
            </div>
            <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3"><label htmlFor="automation-coverage" className="text-sm font-semibold">Estimated share handled by automation</label><span className="text-sm font-bold tabular-nums text-primary">{coverage}%</span></div>
              <input id="automation-coverage" type="range" min="0" max="100" step="5" value={coverage} onChange={(e) => setCoverage(Number(e.target.value))} className="mt-4 w-full accent-[var(--primary)]" />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>0%</span><span>100%</span></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border p-4"><Clock3 className="size-4 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Manual time / month</p><p className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(estimate.manualHours)}h</p></div>
              <div className="rounded-2xl border border-border p-4"><Calculator className="size-4 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Potential time freed</p><p className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(estimate.recoveredHours)}h</p></div>
              <div className="rounded-2xl border border-border p-4"><Wallet className="size-4 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Labour value of time freed</p><p className="mt-1 text-xl font-semibold tabular-nums">{hourlyCost > 0 ? taka.format(estimate.labourValue) : "Add hourly cost"}</p></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
