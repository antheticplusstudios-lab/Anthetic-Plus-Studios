import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listMyToolRequests,
  proposeToolRequest,
  type ToolRequest,
} from "@/lib/tool-builder.functions";
import { INTEGRATION_LABEL } from "@/lib/tool-catalog";

const statusText: Record<ToolRequest["status"], string> = {
  pending_approval: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
};

export function ToolRequestBuilder({
  automationId,
  disabled,
}: {
  automationId: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listMyToolRequests);
  const propose = useServerFn(proposeToolRequest);
  const [text, setText] = useState("");
  const key = ["tool-requests", automationId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { automationId } }) });
  const m = useMutation({
    mutationFn: () => propose({ data: { automationId, request: text } }),
    onSuccess: () => {
      setText("");
      toast.success("Proposal created — our team will review it before it goes live.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create a proposal."),
  });

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Ask for a new capability</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe what you want this automation to do. We'll match it to safe, supported tools and
        review it before it goes live.
      </p>
      <div className="relative mt-4 rounded-2xl p-[1.5px] [background:linear-gradient(90deg,var(--primary),var(--ring),var(--primary))] [background-size:200%_100%] motion-safe:animate-[gradient-x_6s_linear_infinite]">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={disabled || m.isPending}
          placeholder="e.g. Let callers book a haircut, then text them a reminder the day before"
          className="rounded-[calc(1rem-1px)] border-0 bg-card"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          onClick={() => m.mutate()}
          disabled={disabled || m.isPending || text.trim().length < 8}
          className="rounded-full"
        >
          {m.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {m.isPending ? "Building proposal…" : "Propose tools"}
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading requests…</p>}
        {q.isError && <p className="text-sm text-destructive">Couldn't load your requests.</p>}
        {q.data?.requests.length === 0 && (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        )}
        {!!q.data?.tools.length && (
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-sm font-semibold">Your capabilities</p>
            <ul className="mt-2 space-y-1 text-sm">
              {q.data.tools.map((t) => (
                <li key={t.toolId}>
                  <b>{t.toolId.replace(/_/g, " ")}</b> —{" "}
                  {t.status === "active"
                    ? "Live"
                    : t.status === "revoked"
                      ? "Turned off by our team"
                      : `Waiting for setup: ${t.needs ? INTEGRATION_LABEL[t.needs] : "configuration"}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {q.data?.requests.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">“{r.request}”</p>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">
                {statusText[r.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{r.proposal.summary}</p>
            <ul className="mt-3 space-y-2">
              {r.proposal.tools.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <b>{t.label}</b> — {t.reason}
                    {t.setupMissing && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (needs {t.setupMissing} connected)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {r.decisionNote && (
              <p className="mt-2 text-xs">
                <b>{r.status === "rejected" ? "Why not:" : "Note from our team:"}</b>{" "}
                {r.decisionNote}
              </p>
            )}
            {r.proposal.unsupported.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Not supported yet: {r.proposal.unsupported.join("; ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
