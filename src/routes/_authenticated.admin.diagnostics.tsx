import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Stethoscope } from "lucide-react";
import { AdminPage, Panel, StatusPill, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { diagnoseConversation, adminListDiagnosticConversations, adminListDiagnostics } from "@/lib/diagnostics.functions";

export const Route = createFileRoute("/_authenticated/admin/diagnostics")({
  head: () => ({ meta: [{ title: "Conversation Diagnostics — AntheticPlus" }] }),
  component: DiagnosticsPage,
});

type Diag = { severity: string; what_went_wrong: string; recommended_fix: string };

function DiagnosticsPage() {
  const qc = useQueryClient();
  const run = useServerFn(diagnoseConversation);
  const listConversations = useServerFn(adminListDiagnosticConversations);
  const listHistory = useServerFn(adminListDiagnostics);
  const [conversationId, setConversationId] = useState<string>("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Diag | null>(null);

  const convs = useQuery({ queryKey: ["diag-conversations"], queryFn: () => listConversations() });
  const history = useQuery({ queryKey: ["diag-history"], queryFn: () => listHistory() });

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const r = await run({ data: { conversationId: conversationId || null, transcript } });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["diag-history"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnosis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage title="Conversation Diagnostics" subtitle="Find out why an AI conversation failed and how to fix it.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Conversation" description="Pick a saved conversation or paste a transcript.">
          <div className="grid gap-3">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
            >
              <option value="">Paste a transcript instead…</option>
              {(convs.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.channel} · {c.status} · {c.customer_phone_or_id ?? "visitor"} · {timeAgo(c.created_at)}
                </option>
              ))}
            </select>
            {!conversationId && (
              <Textarea
                rows={12}
                placeholder={"USER: Can I book for tomorrow?\nASSISTANT: ..."}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
            )}
            <Button onClick={submit} disabled={busy || (!conversationId && transcript.trim().length < 20)}>
              <Stethoscope className="h-4 w-4" /> {busy ? "Analyzing…" : "Diagnose"}
            </Button>
          </div>
        </Panel>
        <Panel title="Diagnosis">
          {result ? (
            <div className="grid gap-4 text-sm">
              <StatusPill status={result.severity} />
              <div>
                <h3 className="mb-1 font-bold">What went wrong</h3>
                <p className="whitespace-pre-wrap text-muted-foreground">{result.what_went_wrong}</p>
              </div>
              <div>
                <h3 className="mb-1 font-bold">Recommended fix</h3>
                <p className="whitespace-pre-wrap text-muted-foreground">{result.recommended_fix}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Run a diagnosis to see the explanation here.</p>
          )}
        </Panel>
      </div>
      <Panel title="Past diagnoses" className="mt-6">
        <div className="grid gap-3">
          {(history.data ?? []).map((h) => (
            <details key={h.id} className="rounded-xl border border-border p-3 text-sm">
              <summary className="flex cursor-pointer items-center gap-3">
                <StatusPill status={h.severity} />
                <span className="line-clamp-1 flex-1">{h.what_went_wrong}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(h.created_at)}</span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{h.recommended_fix}</p>
            </details>
          ))}
          {history.data?.length === 0 && <p className="text-sm text-muted-foreground">No diagnoses yet.</p>}
        </div>
      </Panel>
    </AdminPage>
  );
}
