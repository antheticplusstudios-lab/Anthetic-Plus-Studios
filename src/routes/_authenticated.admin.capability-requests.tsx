import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, EmptyState, Loading, Panel, StatusPill, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INTEGRATION_LABEL, TOOL_CATALOG } from "@/lib/tool-catalog";
import {
  adminCapabilityAction,
  adminDecideToolRequest,
  adminListCapabilityRequests,
} from "@/lib/tool-builder.functions";

export const Route = createFileRoute("/_authenticated/admin/capability-requests")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Admin Capability Requests — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Admin Capability Requests in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "Capability Requests — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Review, approve, activate and revoke client tool requests.",
      },
    ],
  }),
  component: CapabilityRequestsPage,
});

type Filter = "pending_approval" | "approved" | "rejected";
const err = (e: unknown) =>
  e instanceof Error ? e.message : "The server did not confirm the change.";

function CapabilityRequestsPage() {
  const list = useServerFn(adminListCapabilityRequests);
  const q = useQuery({ queryKey: ["capability-requests"], queryFn: () => list() });
  const [filter, setFilter] = useState<Filter>("pending_approval");

  return (
    <AdminPage
      title="Capability Requests"
      subtitle="Clients ask for new abilities; you approve them here. Approved tools only switch on when their connection (calendar, SMS, payments…) is ready."
    >
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="pending_approval">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <Panel>
          <p className="text-sm text-destructive">Couldn't load requests: {err(q.error)}</p>
        </Panel>
      ) : (
        (() => {
          const rows = (q.data ?? []).filter(
            (r) =>
              r.requests.some((x) => x.status === filter) ||
              (filter === "approved" && r.activation.tools.length),
          );
          if (!rows.length)
            return <EmptyState title="Nothing here" description="No requests in this state." />;
          return rows.map((row) => (
            <AutomationBlock key={row.automation.id} row={row} filter={filter} />
          ));
        })()
      )}
    </AdminPage>
  );
}

type ActionInput =
  | { op: "recheck"; automationId: string }
  | { op: "revoke"; automationId: string; toolId: string; note: string }
  | { op: "rollback"; automationId: string; version: number }
  | { op: "test"; automationId: string; toolId: string };
type Row = Awaited<ReturnType<typeof adminListCapabilityRequests>>[number];

function AutomationBlock({ row, filter }: { row: Row; filter: Filter }) {
  const qc = useQueryClient();
  const decide = useServerFn(adminDecideToolRequest);
  const act = useServerFn(adminCapabilityAction);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = () => qc.invalidateQueries({ queryKey: ["capability-requests"] });
  const m = useMutation({
    mutationFn: (v: {
      automationId: string;
      requestId: string;
      decision: "approved" | "rejected";
      note: string;
    }) => decide({ data: v }),
    onSuccess: (r) => {
      toast.success(
        r.request.status === "approved"
          ? "Approved — tools validated and activation updated."
          : "Rejected — the client will see your reason.",
      );
      void refresh();
    },
    onError: (e) => toast.error(err(e)),
  });
  const a = useMutation({
    mutationFn: (v: ActionInput) => act({ data: v }),
    onSuccess: () => {
      toast.success("Updated.");
      void refresh();
    },
    onError: (e) => toast.error(err(e)),
  });
  const label = (id: string) =>
    TOOL_CATALOG[row.automation.kind].find((t) => t.id === id)?.label ?? id;
  const automationId = row.automation.id;

  return (
    <Panel
      title={row.automation.name}
      description={`Client ${row.automation.clientId.slice(0, 8)} · ${row.automation.kind} · Connected: ${row.connected.join(", ") || "nothing yet"}`}
    >
      <div className="space-y-4">
        {row.requests
          .filter((r) => r.status === filter)
          .map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">“{r.request}”</p>
                <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.proposal.summary}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {r.proposal.tools.map((t) => (
                  <li key={t.id}>
                    <b>{t.label}</b> — {t.reason}
                    {t.requiresIntegration && !row.connected.includes(t.requiresIntegration) && (
                      <span className="ml-1 text-xs text-destructive">
                        Missing: {INTEGRATION_LABEL[t.requiresIntegration]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {r.proposal.unsupported.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Unsupported: {r.proposal.unsupported.join("; ")}
                </p>
              )}
              {r.status === "pending_approval" ? (
                <div className="mt-3 space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Reason for your decision (required, shown to the client)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={m.isPending || (notes[r.id] ?? "").trim().length < 3}
                      onClick={() =>
                        m.mutate({
                          automationId,
                          requestId: r.id,
                          decision: "approved",
                          note: notes[r.id]!,
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={m.isPending || (notes[r.id] ?? "").trim().length < 3}
                      onClick={() =>
                        m.mutate({
                          automationId,
                          requestId: r.id,
                          decision: "rejected",
                          note: notes[r.id]!,
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Decided {timeAgo(r.decidedAt ?? null)} — {r.decisionNote}
                  {r.refusedTools?.length
                    ? ` · Refused on re-validation: ${r.refusedTools.join(", ")}`
                    : ""}
                </p>
              )}
            </div>
          ))}

        {filter === "approved" && row.activation.tools.length > 0 && (
          <div className="rounded-xl bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Live capabilities (v{row.activation.version})</p>
              <Button
                size="sm"
                variant="outline"
                disabled={a.isPending}
                onClick={() => a.mutate({ op: "recheck", automationId })}
              >
                Re-check connections
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {row.activation.tools.map((t) => (
                <li key={t.toolId} className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusPill status={t.status} />
                  <span className="font-medium">{label(t.toolId)}</span>
                  {t.needs && (
                    <span className="text-xs text-destructive">
                      Needs {INTEGRATION_LABEL[t.needs]}
                    </span>
                  )}
                  {t.lastTest && (
                    <span
                      className={`text-xs ${t.lastTest.ok ? "text-primary" : "text-destructive"}`}
                    >
                      Test: {t.lastTest.detail}
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={a.isPending}
                      onClick={() => a.mutate({ op: "test", automationId, toolId: t.toolId })}
                    >
                      Test
                    </Button>
                    {t.status !== "revoked" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={a.isPending}
                        onClick={() =>
                          a.mutate({
                            op: "revoke",
                            automationId,
                            toolId: t.toolId,
                            note: "Revoked by admin",
                          })
                        }
                      >
                        Revoke
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-semibold">History</p>
            <ul className="mt-1 max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
              {row.activation.history.map((h) => (
                <li key={h.version} className="flex items-center gap-2">
                  v{h.version} · {h.action} {h.note ?? ""} · {timeAgo(h.at)}
                  {h.version !== row.activation.version && h.action !== "tested" && (
                    <button
                      className="text-primary hover:underline"
                      disabled={a.isPending}
                      onClick={() => a.mutate({ op: "rollback", automationId, version: h.version })}
                    >
                      Roll back to this
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
