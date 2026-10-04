import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { evaluateTranscript, listEvaluations } from "@/lib/evaluation.functions";

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function TranscriptEvaluator({ automationId }: { automationId: string }) {
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const evaluate = useServerFn(evaluateTranscript);
  const list = useServerFn(listEvaluations);
  const history = useQuery({
    queryKey: ["evaluations", automationId],
    queryFn: () => list({ data: { automationId } }),
  });
  const run = useMutation({
    mutationFn: () => evaluate({ data: { automationId, transcript: text } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["evaluations", automationId] }),
  });
  const r = run.data;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Grade a conversation</h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Paste a chat between a visitor and your receptionist. AI scores its tone, accuracy and helpfulness against your
        business details.
      </p>
      <Textarea
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Visitor: Hi, are you open Saturday?\nReceptionist: Yes! We're open 9am–2pm on Saturdays..."}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => run.mutate()} disabled={run.isPending || text.trim().length < 20}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {run.isPending ? "Evaluating…" : "Evaluate"}
        </Button>
        {run.error && <p className="text-sm text-destructive">{(run.error as Error).message}</p>}
      </div>

      {r && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Score label="Overall" value={r.overall} />
            <Score label="Tone" value={r.tone} />
            <Score label="Accuracy" value={r.accuracy} />
            <Score label="Helpfulness" value={r.helpfulness} />
          </div>
          <p className="text-sm">{r.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Strengths</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Improve</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">{r.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      {!!history.data?.length && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Recent grades</p>
          <ul className="divide-y divide-border text-sm">
            {history.data.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-muted-foreground">{h.summary || "—"}</span>
                <span className="shrink-0 font-bold tabular-nums">{h.overall_score}/100</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
