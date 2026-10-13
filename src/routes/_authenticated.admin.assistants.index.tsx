import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe2, ArrowRight } from "lucide-react";
import { AdminPage, Loading, Panel } from "@/components/admin-ui";
import { SITES, SITE_IDS } from "@/assistant/sites/site-registry";
import { STALE_AFTER_HOURS } from "@/assistant/sites/site-config.types";
import { adminGetSiteConfig } from "@/lib/web-assistant-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/assistants/")({
  head: () => ({ meta: [{ title: "AI Assistants — AntheticPlus Control Center" }] }),
  component: AssistantsOverview,
});

function AssistantsOverview() {
  const get = useServerFn(adminGetSiteConfig);
  const results = useQueries({
    queries: SITE_IDS.map((id) => ({
      queryKey: ["web-assistant", id],
      queryFn: () => get({ data: { siteId: id } }),
    })),
  });
  return (
    <AdminPage
      title="AI Assistants"
      subtitle="One website AI agent per site — chat and voice are the same agent. Admin AI and the four automations are managed separately."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {SITE_IDS.map((id, i) => {
          const q = results[i]!;
          const c = q.data?.config;
          const stale =
            c?.sources.filter(
              (s) =>
                s.active &&
                (!s.lastSuccessAt ||
                  Date.now() - Date.parse(s.lastSuccessAt) > STALE_AFTER_HOURS * 3600_000),
            ).length ?? 0;
          const failed = c?.sources.filter((s) => s.status === "failed").length ?? 0;
          const review = c?.knowledge.filter((k) => k.status === "needs_review").length ?? 0;
          return (
            <Panel
              key={id}
              title={`${SITES[id].name} Assistant`}
              description={
                SITES[id].firstParty
                  ? "This website (first-party)"
                  : (() => {
                      const domains = [
                        ...SITES[id].domains,
                        ...(q.data?.config?.extraDomains ?? []),
                      ];
                      return domains.length
                        ? `Partner website · ${domains.join(", ")}`
                        : "Partner website · domain not configured yet — add it in Manage to go live";
                    })()
              }
            >
              {q.isLoading ? (
                <Loading />
              ) : q.isError || !c ? (
                <p className="text-sm text-destructive">Couldn't load this site's settings.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Pill tone={q.data?.status.missing.length ? "warn" : "ok"}>
                      {!q.data?.status.saved
                        ? "Not set up yet"
                        : q.data.status.missing.length
                          ? "Setup incomplete"
                          : "Ready"}
                    </Pill>
                    <Pill tone={c.enabled ? "ok" : "off"}>
                      {c.enabled ? "Enabled" : "Disabled"}
                    </Pill>
                    <Pill tone={c.voiceEnabled ? "ok" : "off"}>
                      Voice {c.voiceEnabled ? "on" : "off"}
                    </Pill>
                    <Pill tone="info">
                      {c.knowledge.filter((k) => k.status === "approved").length} knowledge items
                    </Pill>
                    <Pill tone="info">{c.allowedTools.length} tools</Pill>
                    {failed > 0 && <Pill tone="bad">{failed} source(s) failing</Pill>}
                    {stale > 0 && <Pill tone="warn">{stale} stale source(s)</Pill>}
                    {review > 0 && <Pill tone="warn">{review} need review</Pill>}
                  </div>
                  {q.data?.status.missing.length ? (
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {q.data.status.missing.map((m) => (
                        <li key={m}>Needed: {m}</li>
                      ))}
                    </ul>
                  ) : null}
                  <Link
                    to="/admin/assistants/$site"
                    params={{ site: id }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <Globe2 className="h-4 w-4" /> Manage {SITES[id].name} Assistant{" "}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </AdminPage>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "ok" | "off" | "bad" | "warn" | "info";
  children: React.ReactNode;
}) {
  const cls = {
    ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    off: "bg-muted text-muted-foreground",
    bad: "bg-destructive/15 text-destructive",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    info: "bg-primary/10 text-primary",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 font-medium ${cls}`}>{children}</span>;
}
