import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { statusClass, statusLabels } from "@/lib/portal";
import { cn } from "@/lib/utils";

export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <div className="page-enter space-y-8">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Control Center</p>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className={cn("card-premium overflow-hidden rounded-2xl border border-border bg-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: ReactNode | undefined;
}) {
  const toneClass = {
    neutral: "text-foreground",
    good: "text-success",
    warn: "text-foreground/80",
    bad: "text-destructive",
  }[tone];
  return (
    <div className="card-premium group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-foreground/80">{icon}</span>
        )}
      </div>
      <p className={cn("mt-4 font-display text-3xl font-semibold tabular-nums tracking-tight", toneClass)}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize",
        statusClass(status),
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} />;
}

export function AreaField(props: React.ComponentProps<typeof Textarea>) {
  return <Textarea {...props} />;
}

export function DataTable({
  head,
  rows,
  empty = "Nothing here yet.",
}: {
  head: string[];
  rows: ReactNode[][];
  empty?: string | undefined;
}) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="-mx-5 -my-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            {head.map((h) => (
              <th key={h} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              {cells.map((cell, j) => (
                <td key={j} className="px-5 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string | undefined }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <div className="space-y-3 border-b border-border pb-6">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-3 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
    </div>
  );
}

export function DangerButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={cn(
        "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        props.className,
      )}
    />
  );
}

export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
