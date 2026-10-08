import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstances } from "@/hooks/use-portal";
import { automations, SLUG_BY_ENGINE_KIND } from "@/lib/automations";
import { daysRemaining } from "@/lib/portal";
import {
  customerStatus,
  deploymentStateOf,
  engineKindOf,
  nextAction,
  settingsFromConfig,
  setupProgress,
} from "@/lib/automation-config";
import { FolderFloat } from "@/components/folder-float";

export const Route = createFileRoute("/_authenticated/dashboard/automations/")({
  head: () => ({
    meta: [
      { title: "My Automations — AntheticPlus Studios" },
      {
        name: "description",
        content: "Status, setup progress and next steps for every automation you own.",
      },
      { property: "og:title", content: "My AntheticPlus Automations" },
      {
        property: "og:description",
        content: "Status, setup progress and next steps for every automation you own.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const TONE: Record<string, string> = {
  ACTIVE: "border-success/40 text-success",
  TESTING: "border-primary/40 text-primary",
  EXPIRED: "border-destructive/50 text-destructive",
  "ACTION REQUIRED": "border-destructive/50 text-destructive",
};

function Page() {
  const { data: instances = [], isLoading } = useInstances();
  return (
    <div className="page-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">My Automations</h1>
          <p className="mt-2 text-muted-foreground">
            Live status, setup progress and what to do next.
          </p>
        </div>
        <Button asChild>
          <Link to="/automations">
            <Plus />
            Add automation
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {instances.map((item) => {
          const row = item as typeof item & {
            last_success_at?: string | null;
            last_error?: string | null;
            last_error_at?: string | null;
          };
          const kind = engineKindOf(row);
          const meta = automations.find(
            (a) =>
              (kind && a.slug === SLUG_BY_ENGINE_KIND[kind]) || a.slug === item.automation_slug,
          );
          const state = deploymentStateOf(row);
          const progress = kind
            ? setupProgress(
                kind,
                settingsFromConfig(row.config),
                state,
                Boolean(row.last_success_at),
              )
            : null;
          const status = progress
            ? customerStatus(state, progress, row.last_error ?? null)
            : state.toUpperCase();
          const action = progress ? nextAction(state, progress, row.last_error ?? null) : "—";
          const left = item.expires_at ? daysRemaining(item.expires_at) : null;
          const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
          const missing = progress?.steps.filter((s) => !s.done).map((s) => s.label) ?? [];
          return (
            <article
              key={item.id}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold">{meta?.name ?? item.automation_slug}</h2>
                  <p className="text-xs text-muted-foreground">
                    {item.website_domain || "No domain yet"}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold ${TONE[status] ?? "border-border text-muted-foreground"}`}
                >
                  {status}
                </span>
              </div>

              {progress && (
                <div className="mt-5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">
                      {progress.done}/{progress.total} setup steps completed
                    </span>
                    <span className="tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}

              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Next step</dt>
                  <dd className="font-semibold">{action}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expiry</dt>
                  <dd
                    className={`font-semibold ${left !== null && left <= 3 ? "text-destructive" : ""}`}
                  >
                    {item.expires_at
                      ? `${new Date(item.expires_at).toLocaleDateString()} (${left}d)`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last successful run</dt>
                  <dd className="font-semibold">
                    {row.last_success_at
                      ? new Date(row.last_success_at).toLocaleString()
                      : "No runs yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Activity</dt>
                  <dd className="font-semibold">
                    {item.conversations_count} conversations · {item.leads_count} leads
                  </dd>
                </div>
              </dl>

              {row.last_error && (
                <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 p-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {row.last_error}
                </p>
              )}

              <div className="mt-5 flex items-end justify-between gap-3">
                {missing.length ? (
                  <FolderFloat
                    label="Remaining setup"
                    sublabel={`${missing.length} left`}
                    items={missing}
                  />
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" /> Fully set up
                  </span>
                )}
                <Button variant="outline" asChild>
                  <Link to="/dashboard/automations/$id" params={{ id: item.id }}>
                    Open <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            </article>
          );
        })}
        {!isLoading && instances.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground lg:col-span-2">
            You don't have any automations yet. Choose one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
