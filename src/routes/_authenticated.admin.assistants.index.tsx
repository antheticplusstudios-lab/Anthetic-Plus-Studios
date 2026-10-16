import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
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
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-5">
        <Input
          className="max-w-sm"
          aria-label="Search assistants"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or website…"
        />
        <select
          aria-label="Assistant status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="enabled">Enabled draft</option>
          <option value="disabled">Disabled draft</option>
        </select>
        <Button
          variant="outline"
          onClick={() => {
            setSearch("");
            setStatus("all");
          }}
        >
          Reset
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SITE_IDS.map((id, i) => {
          const q = results[i];
          if (!q) return null;
          const c = q.data?.config;
          if (
            !`${SITES[id].name} ${c?.displayName ?? ""} ${(c?.extraDomains ?? []).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()) ||
            (c && status !== "all" && c.enabled !== (status === "enabled"))
          )
            return null;
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
                <div>
                  <p role="alert" className="text-sm text-destructive">
                    Couldn't load this site's settings.
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() => void q.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Publishing state: {q.data?.agentState ?? "Unknown"} · Updated{" "}
                    {q.data?.status.updatedAt
                      ? new Date(q.data.status.updatedAt).toLocaleDateString()
                      : "Not saved"}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Pill tone={q.data?.status.missing.length ? "warn" : "ok"}>
                      {!q.data?.status.saved
                        ? "Not set up yet"
                        : q.data.status.missing.length
                          ? "Setup incomplete"
                          : "Ready"}
                    </Pill>
                    <Pill tone={c.enabled ? "ok" : "off"}>
                      {c.enabled ? "Draft enabled" : "Draft disabled"}
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
  children: ReactNode;
}) {
  const cls = {
    ok: "bg-success/10 text-success",
    off: "bg-muted text-muted-foreground",
    bad: "bg-destructive/15 text-destructive",
    warn: "bg-secondary text-foreground",
    info: "bg-primary/10 text-primary",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 font-medium ${cls}`}>{children}</span>;
}
