import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AreaField, DataTable, Loading, Panel, StatusPill, shortDate } from "@/components/admin-ui";
import {
  useAllInstances,
  useTranscripts,
  useUsage,
  useAdminSetAutomationKill,
  useAdminSetAutomationPrompt,
} from "@/hooks/use-admin";
import { adminListAutomations } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/transcripts")({
  component: AutomationsAndTranscripts,
});

type Message = { role: string; content: string };

function AutomationsAndTranscripts() {
  const { data: instances = [], isLoading: instancesLoading } = useAllInstances();
  const { data: usage = [], isLoading: usageLoading } = useUsage();
  const { data: transcripts = [], isLoading: transcriptsLoading } = useTranscripts();
  const queryClient = useQueryClient();
  const kill = useAdminSetAutomationKill();
  const prompt = useAdminSetAutomationPrompt();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState(false);

  if (instancesLoading || usageLoading || transcriptsLoading) return <Loading />;

  type AutomationSummary = Awaited<ReturnType<typeof adminListAutomations>>[number];
  const selected = instances.find((i) => i.id === selectedId) ?? null;

  const toggleKill = async (instance: AutomationSummary, killed: boolean) => {
    try {
      await kill.mutateAsync({
        automationId: instance.id,
        killed,
        reason: killed ? "Admin kill switch" : "Admin kill switch released",
      });
      if (killed) toast.warning("Kill switch engaged — the widget stops answering immediately.");
      else toast.success("Kill switch released — the widget resumes answering.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openInspect = (instance: AutomationSummary) => {
    setSelectedId(instance.id);
    setOverrideDraft(instance.prompt_override ?? "");
  };

  const saveOverride = async () => {
    if (!selected) return;
    setSavingOverride(true);
    try {
      await prompt.mutateAsync({ automationId: selected.id, prompt: overrideDraft });
    } catch (e) {
      setSavingOverride(false);
      toast.error((e as Error).message);
      return;
    }
    setSavingOverride(false);
    toast.success("Prompt override saved");
    void queryClient.invalidateQueries({ queryKey: ["admin", "instances"] });
  };

  const rows = instances.map((instance) => [
    <span className="font-bold" key="slug">
      {instance.automation_slug}
    </span>,
    instance.website_domain,
    <StatusPill key="status" status={instance.status} />,
    <span className="tabular-nums" key="cid">
      {instance.client_id || "—"}
    </span>,
    shortDate(instance.expires_at),
    <span className="tabular-nums" key="conv">
      {instance.conversations_count}
    </span>,
    <span className="tabular-nums" key="leads">
      {instance.leads_count}
    </span>,
    <Switch
      key="kill"
      checked={!!instance.killed}
      onCheckedChange={(checked: boolean) => void toggleKill(instance, checked)}
    />,
    <Button key="inspect" size="sm" variant="outline" onClick={() => openInspect(instance)}>
      Inspect
    </Button>,
  ]);

  const instanceUsage = selected ? usage.filter((u) => u.automation_id === selected.id) : [];
  const instanceTranscripts = selected
    ? transcripts.filter((t) => t.automation_id === selected.id)
    : [];

  return (
    <div className="page-enter space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Active Automations & Transcripts</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Live status of every deployed automation, an emergency kill switch, prompt overrides and
          token usage.
        </p>
      </div>

      <Panel title="All automations">
        <DataTable
          head={[
            "Automation",
            "Domain",
            "Status",
            "Client ID",
            "Expires",
            "Conversations",
            "Leads",
            "Kill switch",
            "",
          ]}
          rows={rows}
          empty="No automations deployed yet."
        />
      </Panel>

      {selected && (
        <Panel
          title={`Inspecting ${selected.automation_slug}`}
          description={selected.website_domain}
        >
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Prompt override (global prompt stays in effect unless set)
              </p>
              <AreaField
                rows={6}
                value={overrideDraft}
                onChange={(e) => setOverrideDraft(e.target.value)}
                placeholder="Leave blank to use the global system prompt"
              />
              <Button
                className="mt-3"
                onClick={() => void saveOverride()}
                disabled={savingOverride}
              >
                Save override
              </Button>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Token usage
              </p>
              <DataTable
                head={["Model", "Tokens in", "Tokens out", "Date"]}
                rows={instanceUsage.map((u) => [
                  u.model,
                  <span className="tabular-nums" key="ti">
                    {u.tokens_in}
                  </span>,
                  <span className="tabular-nums" key="to">
                    {u.tokens_out}
                  </span>,
                  shortDate(u.created_at),
                ])}
                empty="No usage recorded for this automation."
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Transcripts
            </p>
            {instanceTranscripts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No transcripts recorded yet.
              </p>
            ) : (
              <div className="space-y-4">
                {instanceTranscripts.map((t) => (
                  <div key={t.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-bold">{t.visitor || "Anonymous visitor"}</span>
                      <span>{shortDate(t.created_at)}</span>
                    </div>
                    <div className="space-y-2">
                      {((t.messages as Message[]) ?? []).map((m, idx) => (
                        <div
                          key={idx}
                          className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                            m.role === "user"
                              ? "ml-0 bg-secondary"
                              : "ml-auto bg-primary text-primary-foreground"
                          }`}
                        >
                          {m.content}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
