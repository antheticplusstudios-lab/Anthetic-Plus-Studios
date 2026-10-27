import { useT } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { getSystemStatus } from "@/lib/status.functions";
import { Hero3D } from "@/components/hero-3d";

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
  const t = useT();
  const fetchStatus = useServerFn(getSystemStatus);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  const rows = [
    {
      name: t("Application & dashboards", "অ্যাপ্লিকেশন ও ড্যাশবোর্ড"),
      ok: data?.api.ok ?? true,
      detail: data
        ? t(`${data.api.latencyMs} ms response`, `${data.api.latencyMs} মিলিসেকেন্ডে সাড়া`)
        : t("Checking…", "যাচাই করা হচ্ছে…"),
    },
    {
      name: t("Database & tenant isolation", "ডেটাবেস ও ক্লায়েন্টের ডেটা পৃথকীকরণ"),
      ok: data?.database.ok ?? true,
      detail: data
        ? t(
            `${data.database.latencyMs} ms query`,
            `${data.database.latencyMs} মিলিসেকেন্ডে কুয়েরি`,
          )
        : t("Checking…", "যাচাই করা হচ্ছে…"),
    },
    {
      name: t("AI inference", "AI ইনফারেন্স"),
      ok: data?.inference.ok ?? true,
      detail: data?.inference.ok
        ? t("Model gateway reachable", "মডেল গেটওয়ের সঙ্গে সংযোগ রয়েছে")
        : t("Awaiting provider key", "প্রদানকারীর কী-এর অপেক্ষায়"),
    },
    {
      name: t("Public widget API", "পাবলিক উইজেট API"),
      ok: true,
      detail: t("Origin-verified edge endpoints", "উৎস যাচাইকৃত এজ এন্ডপয়েন্ট"),
    },
    {
      name: t("Scheduled billing jobs", "নির্ধারিত বিলিং কার্যক্রম"),
      ok: true,
      detail: t(
        "Daily lifecycle run at 06:00 UTC",
        "প্রতিদিন 06:00 UTC-তে লাইফসাইকেল কার্যক্রম চলে",
      ),
    },
  ];

  const allOk = rows.every((r) => r.ok);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="relative px-4 py-16 sm:px-6">
        <Hero3D />
        <Reveal className="relative mx-auto max-w-4xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
                <Activity className="h-6 w-6 text-primary" />{" "}
                {t("System status", "সিস্টেমের অবস্থা")}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {allOk
                  ? t("All systems operational.", "সব সিস্টেম সচল রয়েছে।")
                  : t("Some systems need attention.", "কিছু সিস্টেমে নজর দেওয়া প্রয়োজন।")}{" "}
                {t(
                  "Refreshed automatically every 30 seconds.",
                  "প্রতি ৩০ সেকেন্ডে স্বয়ংক্রিয়ভাবে হালনাগাদ হয়।",
                )}
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {t("Refresh", "রিফ্রেশ করুন")}
            </Button>
          </div>

          <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 px-5 py-4">
            <p className="flex items-center gap-2 font-bold text-success">
              {allOk ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
              {allOk
                ? t("All checks passing right now", "এই মুহূর্তে সব যাচাই সফল")
                : t("Degraded performance detected", "কর্মক্ষমতার অবনতি শনাক্ত হয়েছে")}
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
            {t("Last checked:", "সর্বশেষ যাচাই:")}{" "}
            {data ? new Date(data.checkedAt).toUTCString() : "…"}
          </p>
        </Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}
