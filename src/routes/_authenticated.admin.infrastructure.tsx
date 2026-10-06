import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AreaField,
  DangerButton,
  DataTable,
  Field,
  Loading,
  Panel,
  TextField,
  timeAgo,
} from "@/components/admin-ui";
import {
  useCreateGroqKey,
  useDeleteGroqKey,
  useFailoverLog,
  useGroqKeys,
  usePrompts,
  useAdminSavePrompt,
  useUpdateGroqKey,
} from "@/hooks/use-admin";

import { useAssistantStatus, useSaveAssistantSettings } from "@/hooks/use-assistant";

export const Route = createFileRoute("/_authenticated/admin/infrastructure")({
  component: InfrastructurePage,
});

function cooldownRemaining(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m remaining`;
  return `${Math.round(mins / 60)}h remaining`;
}

function InfrastructurePage() {
  const { data: keys = [], isLoading: keysLoading } = useGroqKeys();
  const { data: failoverLog = [], isLoading: failoverLoading } = useFailoverLog();
  const { data: prompts = [], isLoading: promptsLoading } = usePrompts();
  const createKey = useCreateGroqKey();
  const updateKey = useUpdateGroqKey();
  const deleteKey = useDeleteGroqKey();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savePromptFn = useAdminSavePrompt();
  const assistant = useAssistantStatus();
  const saveAssistant = useSaveAssistantSettings();
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [assistantModel, setAssistantModel] = useState("");

  const saveAssistantSettings = () => {
    saveAssistant.mutate(
      { keyValue: openRouterKey.trim() || undefined, model: assistantModel.trim() || undefined },
      {
        onSuccess: () => {
          setOpenRouterKey("");
          setAssistantModel("");
          toast.success("Assistant settings saved");
        },
      },
    );
  };

  if (keysLoading || failoverLoading || promptsLoading) return <Loading />;

  const draftFor = (row: (typeof prompts)[number]) => promptDrafts[row.key] ?? row.content ?? "";

  const savePrompt = async (row: (typeof prompts)[number]) => {
    setSavingKey(row.key);
    try {
      await savePromptFn.mutateAsync({ key: row.key, content: draftFor(row) });
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddKey = () => {
    if (!label.trim() || keyValue.trim().length < 8) {
      toast.error("Provide a label and a key of at least 8 characters");
      return;
    }
    createKey.mutate(
      { label: label.trim(), keyValue: keyValue.trim(), isPrimary },
      {
        onSuccess: () => {
          setLabel("");
          setKeyValue("");
          setIsPrimary(false);
        },
      },
    );
  };

  return (
    <div className="page-enter space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Infrastructure & Groq Pool</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          The key rotation pool, failover history and the global prompt baseline.
        </p>
      </div>

      <Panel
        title="AI assistant"
        description="Owner and Partner copilot. Your OpenRouter key stays on the server — only a masked hint is shown here."
        actions={
          assistant.data?.configured ? (
            <span className="rounded-full bg-success/12 px-2.5 py-1 text-xs font-bold text-success">
              Connected {assistant.data.hint}
            </span>
          ) : (
            <span className="rounded-full bg-foreground/12 px-2.5 py-1 text-xs font-bold text-foreground">
              Key required
            </span>
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="OpenRouter API key"
            hint="Paste a new key to replace it. Leave empty to keep the current one."
          >
            <TextField
              type="password"
              autoComplete="off"
              placeholder={assistant.data?.hint || "sk-or-…"}
              value={openRouterKey}
              onChange={(event) => setOpenRouterKey(event.target.value)}
            />
          </Field>
          <Field label="Model" hint={`Current: ${assistant.data?.model ?? "openai/gpt-4o-mini"}`}>
            <TextField
              placeholder={assistant.data?.model ?? "openai/gpt-4o-mini"}
              value={assistantModel}
              onChange={(event) => setAssistantModel(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={saveAssistantSettings} disabled={saveAssistant.isPending}>
            {saveAssistant.isPending && <Loader2 className="animate-spin" />}
            Save assistant settings
          </Button>
          {assistant.data?.configured && (
            <Button
              variant="outline"
              onClick={() =>
                saveAssistant.mutate(
                  { clearKey: true },
                  { onSuccess: () => toast.success("Assistant key removed") },
                )
              }
            >
              Remove key
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Get a key at openrouter.ai/keys. Only owners and partners can ask the assistant.
          </p>
        </div>
      </Panel>

      <Panel title="Key pool">
        {keys.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No keys configured yet. Add one below to enable the widget.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {keys.map((key) => {
              const remaining = cooldownRemaining(key.cooldown_until);
              return (
                <div key={key.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{key.label}</p>
                      <p className="text-xs text-muted-foreground">{key.key_hint}</p>
                    </div>
                    {key.is_primary && (
                      <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-bold text-primary">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">Requests: {key.request_count}</span>
                    <span className="tabular-nums">Errors: {key.error_count}</span>
                    <span>Used {timeAgo(key.last_used_at)}</span>
                    {remaining && (
                      <span className="font-bold text-destructive">Cooldown: {remaining}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Switch
                      checked={key.enabled}
                      onCheckedChange={(enabled: boolean) =>
                        updateKey.mutate({ id: key.id, enabled })
                      }
                    />
                    <span className="text-xs font-semibold text-muted-foreground">
                      {key.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {!key.is_primary && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateKey.mutate({ id: key.id, makePrimary: true })}
                      >
                        Make primary
                      </Button>
                    )}
                    {remaining && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateKey.mutate({ id: key.id, clearCooldown: true })}
                      >
                        Clear cooldown
                      </Button>
                    )}
                    <DangerButton size="sm" onClick={() => deleteKey.mutate({ id: key.id })}>
                      Remove
                    </DangerButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Add a key" description="Values are stored server-side and never shown again">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label">
            <TextField
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Groq — primary"
            />
          </Field>
          <Field label="Key">
            <TextField
              type="password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="gsk_..."
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <Checkbox checked={isPrimary} onCheckedChange={(v) => setIsPrimary(v === true)} />
          Set as primary
        </label>
        <Button className="mt-4" onClick={handleAddKey} disabled={createKey.isPending}>
          Add key
        </Button>
      </Panel>

      <Panel title="Failover log">
        <DataTable
          head={["When", "Status", "Key", "Message"]}
          rows={[...failoverLog]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((f) => [
              timeAgo(f.created_at),
              <span className="tabular-nums" key="sc">
                {f.status_code}
              </span>,
              f.key_id ? `${String(f.key_id).slice(0, 8)}…` : "—",
              f.message,
            ])}
          empty="No rate-limit events recorded"
        />
      </Panel>

      <Panel
        title="Global prompt baseline"
        description="{company} is replaced per client at send time"
      >
        {prompts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No global prompt rows configured.
          </p>
        ) : (
          <div className="grid gap-4">
            {prompts.map((row: (typeof prompts)[number]) => (
              <div key={row.key} className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {row.key}
                </p>
                <AreaField
                  rows={4}
                  value={draftFor(row)}
                  onChange={(e) =>
                    setPromptDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))
                  }
                />
                <Button
                  className="mt-3"
                  onClick={() => void savePrompt(row)}
                  disabled={savingKey === row.key}
                >
                  Save
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        Need to deploy an automation once its payment clears? Visit the{" "}
        <Link to="/admin/creator" className="font-bold text-primary underline">
          Automation Creator
        </Link>
        .
      </p>
    </div>
  );
}
