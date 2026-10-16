import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Panel, StatusPill, Loading } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { adminListTrainingJobs, adminRunTraining } from "@/lib/training.functions";

type Job = {
  id: string;
  target: string;
  status: string;
  pages: number;
  chunks: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

const SITES = [
  { id: "site:antheticplus", label: "AntheticPlus website assistant" },
  { id: "site:ny-partners", label: "Partner (Autumic) website assistant" },
];

/** Shows training targets with "Train now" and persisted job history. Optional type filter for one automation. */
export function TrainingPanel({
  types,
  showSites = true,
}: {
  types?: string[];
  showSites?: boolean;
}) {
  const qc = useQueryClient();
  const list = useServerFn(adminListTrainingJobs);
  const run = useServerFn(adminRunTraining);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["training-jobs"],
    queryFn: () => list(),
    refetchInterval: busy ? 3000 : 15000,
  });

  const jobs = (q.data?.jobs ?? []) as Job[];
  const autos = (q.data?.automations ?? []) as {
    id: string;
    client_id: string;
    automation_type: string;
    domain_url: string;
  }[];
  const targets = [
    ...(showSites ? SITES : []),
    ...autos
      .filter((a) => !types || types.includes(a.automation_type))
      .map((a) => ({
        id: `automation:${a.id}`,
        label: `${a.client_id} · ${a.domain_url || "no website"}`,
      })),
  ];
  const latest = (t: string) => jobs.find((j) => j.target === t);

  async function train(target: string) {
    setBusy(target);
    try {
      const r = (await run({ data: { target } })) as {
        ok: boolean;
        error?: string;
        pages?: number;
      };
      if (r.ok) toast.success(`Trained from ${r.pages ?? 0} pages`);
      else toast.error(r.error ?? "Training failed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: ["training-jobs"] });
    }
  }

  if (q.isLoading) return <Loading label="Loading training…" />;
  return (
    <div className="space-y-4">
      {q.data && !q.data.ok && (
        <p className="text-sm text-destructive">
          Training history isn't available yet: {q.data.message}
        </p>
      )}
      <Panel
        title="Train now"
        description="Reads the website, saves clean knowledge and fills gaps with AI when a site has little text."
      >
        <ul className="divide-y">
          {targets.map((t) => {
            const j = latest(t.id);
            const running = busy === t.id || j?.status === "running";
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-56 flex-1">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {j
                      ? `Last run ${new Date(j.created_at).toLocaleString()} · ${j.pages} pages · ${j.chunks} knowledge pieces`
                      : "Never trained"}
                    {j?.error ? ` · ${j.error}` : ""}
                  </div>
                </div>
                {j && <StatusPill status={running ? "running" : j.status} />}
                <Button size="sm" disabled={running} onClick={() => void train(t.id)}>
                  {running ? "Training…" : "Train now"}
                </Button>
              </li>
            );
          })}
          {!targets.length && (
            <li className="py-3 text-sm text-muted-foreground">Nothing to train yet.</li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
