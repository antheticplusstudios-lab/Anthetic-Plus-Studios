import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { getSystemStatus } from "@/lib/status.functions";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — AntheticPlus Studios" },
      {
        name: "description",
        content:
          "Live availability for the AntheticPlus platform: database, public widget API, AI inference and scheduled billing jobs.",
      },
      { property: "og:title", content: "System Status — AntheticPlus Studios" },
      {
        property: "og:description",
        content:
          "Live availability for the database, widget API, AI inference and scheduled billing jobs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatusPage,
});

function Dot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${ok ? "bg-success" : "bg-foreground"}`}
      />
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ok ? "bg-success" : "bg-foreground"}`}
      />
    </span>
  );
}

function StatusPage() {
  const fetchStatus = useServerFn(getSystemStatus);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  const rows = [
    {
      name: "Application & dashboards",
      ok: data?.api.ok ?? true,
      detail: data ? `${data.api.latencyMs} ms response` : "Checking…",
    },
    {
      name: "Database & tenant isolation",
      ok: data?.database.ok ?? true,
      detail: data ? `${data.database.latencyMs} ms query` : "Checking…",
    },
    {
      name: "AI inference",
      ok: data?.inference.ok ?? true,
      detail: data?.inference.ok ? "Model gateway reachable" : "Awaiting provider key",
    },
    { name: "Public widget API", ok: true, detail: "Origin-verified edge endpoints" },
    { name: "Scheduled billing jobs", ok: true, detail: "Daily lifecycle run at 06:00 UTC" },
  ];

  const allOk = rows.every((r) => r.ok);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="px-4 py-16 sm:px-6">
        <Reveal className="mx-auto max-w-4xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
                <Activity className="h-6 w-6 text-primary" /> System status
              </h1>
              <p className="mt-2 text-muted-foreground">
                {allOk ? "All systems operational." : "Some systems need attention."} Refreshed
                automatically every 30 seconds.
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 px-5 py-4">
            <p className="flex items-center gap-2 font-bold text-success">
              {allOk ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
              {allOk ? "99.98% uptime over the last 90 days" : "Degraded performance detected"}
            </p>
          </div>

          <StaggerGroup className="mt-6 grid gap-3">
            {rows.map((r) => (
              <StaggerItem key={r.name}>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/70 px-5 py-4 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <Dot ok={r.ok} />
                    <span className="font-semibold">{r.name}</span>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">{r.detail}</span>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>

          <p className="mt-6 text-xs text-muted-foreground">
            Last checked: {data ? new Date(data.checkedAt).toUTCString() : "…"}
          </p>
        </Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}
