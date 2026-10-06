import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AdminPage, DataTable, Panel, StatusPill, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listGroqKeys, createGroqKey, updateGroqKey, deleteGroqKey } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/llm-keys")({
  head: () => ({ meta: [{ title: "AI Key Pool — AntheticPlus" }] }),
  component: KeysPage,
});

function KeysPage() {
  const qc = useQueryClient();
  const [n, setN] = useState({
    provider: "openrouter" as "groq" | "openrouter" | "openai" | "anthropic",
    label: "",
    api_key: "",
    model: "",
  });
  const list = useQuery({
    queryKey: ["llm-keys"],
    queryFn: () => listGroqKeys(),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["llm-keys"] });
  async function add() {
    try {
      await createGroqKey({
        data: {
          provider: n.provider,
          label: n.label,
          keyValue: n.api_key,
          model: n.model || undefined,
          isPrimary: false,
        },
      });
      setN({ ...n, label: "", api_key: "", model: "" });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add key.");
    }
  }
  async function patch(id: string, p: Record<string, unknown>) {
    try {
      await updateGroqKey({
        data: {
          id,
          enabled: typeof p.is_active === "boolean" ? p.is_active : undefined,
          makePrimary: false,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update key.");
    }
    refresh();
  }
  async function del(id: string) {
    try {
      await deleteGroqKey({ data: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete key.");
    }
    refresh();
  }
  return (
    <AdminPage
      title="AI Key Pool"
      subtitle="Provider keys your server rotates through by priority, with cooldown on errors. Owner only."
    >
      <Panel title="Add key" className="mb-6">
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={n.provider}
            onChange={(e) => {
              const provider = (["openrouter", "groq", "openai", "anthropic"] as const).find(
                (value) => value === e.target.value,
              );
              if (provider) setN({ ...n, provider });
            }}
          >
            <option value="openrouter">OpenRouter</option>
            <option value="groq">Groq</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
          <Input
            className="w-40"
            placeholder="Label"
            value={n.label}
            onChange={(e) => setN({ ...n, label: e.target.value })}
          />
          <Input
            className="w-48"
            placeholder="Model (optional)"
            value={n.model}
            onChange={(e) => setN({ ...n, model: e.target.value })}
          />
          <Input
            className="flex-1"
            type="password"
            placeholder="API key"
            value={n.api_key}
            onChange={(e) => setN({ ...n, api_key: e.target.value })}
          />
          <Button disabled={n.api_key.length < 10} onClick={() => void add()}>
            Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          OpenRouter and Groq fall back to a default model if left blank. Anthropic requires a model
          (e.g. a current Claude model ID from your Anthropic account) — it's skipped otherwise.
        </p>
      </Panel>
      <Panel>
        <DataTable
          head={["Provider", "Label", "Model", "Key", "Requests", "Errors", "Status", "Added", ""]}
          empty="No keys yet."
          rows={(list.data ?? []).map((k) => [
            k.provider_key,
            k.label || "—",
            k.model || "—",
            <span className="font-mono text-xs">…{k.key_hint}</span>,
            k.request_count,
            k.error_count,
            k.cooldown_until && new Date(k.cooldown_until) > new Date() ? (
              <StatusPill status="cooling down" />
            ) : (
              <Switch
                checked={k.is_active}
                onCheckedChange={(v) => void patch(k.id, { is_active: v })}
              />
            ),
            timeAgo(k.created_at),
            <Button size="icon" variant="ghost" onClick={() => void del(k.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>,
          ])}
        />
      </Panel>
    </AdminPage>
  );
}
