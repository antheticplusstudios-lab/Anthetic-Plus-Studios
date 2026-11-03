import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StatusPill, timeAgo } from "@/components/admin-ui";
import { WidgetCustomizer } from "@/components/widget-customizer";
import { AUTOMATION_LABEL, MESSAGING_FEATURES, RECEPTIONIST_CAPABILITIES } from "@/lib/catalog-v2";
import {
  getMyAutomationPortal,
  getConversationMessages,
  updateAutomationTask,
  createCrawlJob,
  deleteKnowledgeDocument,
  saveManualKnowledgeDocument,
  saveAutomationIntegration,
  removeAutomationIntegration,
  generateMyInstallScript,
  saveMyAutomationSettings,
  updateMyLeadStatus,
  updateMyTicketStatus,
  updateMyAppointmentStatus,
} from "@/lib/client-platform.functions";
import { CONFIG_FIELDS, engineKindOf, type EngineKind } from "@/lib/automation-config";

export const Route = createFileRoute("/_authenticated/dashboard/portal/$id")({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Dashboard Portal Id in the Autumic AI automation platform.",
      },
      { property: "og:title", content: "Dashboard Portal Id — Autumic" },
      {
        property: "og:description",
        content: "Dashboard Portal Id in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Automation Portal — Autumic" },
    ],
  }),
  component: PortalPage,
});

const TABS_BY_KIND: Record<EngineKind, string[]> = {
  ai_receptionist: ["Overview", "Calls & Bookings", "Settings", "Phone & Calendar", "Installation"],
  lead_capture: ["Overview", "Leads CRM", "Settings", "Installation"],
  kb_support: ["Overview", "Support Desk", "Knowledge Base", "Settings", "Installation"],
  messaging_ai: ["Overview", "Conversations", "Channels", "Settings", "Widget", "Installation"],
};

function copy(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success("Copied");
}

function PortalPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState("Overview");
  const portal = useQuery({
    queryKey: ["automation-portal", id],
    queryFn: () => getMyAutomationPortal({ data: { automationId: id } }),
  });
  const qc = useQueryClient();
  const a = portal.data?.automation;
  const pd = portal.data;
  if (!a || !pd)
    return (
      <p className="text-muted-foreground">
        {portal.isError ? "Automation not found." : "Loading…"}
      </p>
    );
  const refresh = () => void qc.invalidateQueries({ queryKey: ["automation-portal", id] });
  const kind = engineKindOf(a);
  const tabs = kind ? TABS_BY_KIND[kind] : ["Overview", "Installation"];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {kind === "ai_receptionist" ? "Voice operations" :
              kind === "lead_capture" ? "Sales pipeline" :
                kind === "kb_support" ? "Customer support" :
                  kind === "messaging_ai" ? "Social messaging" : "Automation workspace"}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">
            {AUTOMATION_LABEL[a.automation_type ?? ""] ?? a.name ?? a.automation_type}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.domain_url} · Order {a.order_id ?? "—"}
          </p>
        </div>
        <StatusPill status={a.run_state ?? a.status} />
      </div>
      {a.requires_reinstallation && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4" /> Your settings changed and the script was rotated.
          Generate and reinstall the new snippet below.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={t === tab ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {tab === "Overview" && <Overview portal={pd} kind={kind} refresh={refresh} />}
      {tab === "Calls & Bookings" && (
        <div className="grid gap-6">
          <Appointments automationId={id} rows={pd.appointments} refresh={refresh} />
          <Inbox automationId={id} conversations={pd.conversations} />
        </div>
      )}
      {tab === "Leads CRM" && <Leads automationId={id} rows={pd.leads} refresh={refresh} />}
      {tab === "Support Desk" && (
        <div className="grid gap-6">
          <Tickets automationId={id} rows={pd.tickets} refresh={refresh} />
          <Inbox automationId={id} conversations={pd.conversations} />
        </div>
      )}
      {tab === "Conversations" && <Inbox automationId={id} conversations={pd.conversations} />}
      {tab === "Knowledge Base" && (
        <Knowledge automationId={id} clientId={a.client_id} documents={pd.knowledge} crawlJobs={pd.crawlJobs} refresh={refresh} />
      )}
      {tab === "Settings" && kind && (
        <AutomationSettings automationId={id} kind={kind} initial={a.settings ?? {}} refresh={refresh} />
      )}
      {tab === "Phone & Calendar" && kind === "ai_receptionist" && (
        <Integrations automationId={id} clientId={a.client_id} connections={pd.integrations} providers={["twilio", "google_calendar"]} />
      )}
      {tab === "Channels" && kind === "messaging_ai" && (
        <Integrations automationId={id} clientId={a.client_id} connections={pd.integrations} providers={["whatsapp", "meta_page", "messenger", "instagram"]} />
      )}
      {tab === "Widget" && <WidgetCustomizer automationId={id} initial={a.widget_config} onSaved={refresh} />}
      {tab === "Installation" && <Installation automationId={id} domain={a.domain_url} refresh={refresh} />}
    </div>
  );
}

type PortalData = Awaited<ReturnType<typeof getMyAutomationPortal>>;

function Overview({ portal, refresh }: { portal: PortalData; refresh: () => void }) {
  const a = portal.automation;
  const [snippet, setSnippet] = useState("");
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const result = await generateMyInstallScript({ data: { automationId: a.id } });
      setSnippet(result.snippet);
      refresh();
      toast.success("New installation script generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate script.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Install script</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void generate()} disabled={busy}>
              {busy ? "Generating…" : "Generate script"}
            </Button>
            {snippet && (
              <Button size="sm" variant="outline" onClick={() => copy(snippet)}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
            )}
          </div>
        </div>
        {snippet ? (
          <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">{snippet}</pre>
        ) : (
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            For security, raw installation tokens are not retained. Generate a script when you need
            to install or reinstall this automation.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Paste before the closing body tag. Generating a new script invalidates the previous token.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          label="Phone number"
          value={a.assigned_phone_number ?? "Not assigned"}
          action={a.assigned_phone_number ? () => copy(a.assigned_phone_number!) : undefined}
        />
        <Stat
          label="Tokens this month"
          value={Number(portal.usage?.tokens_used ?? 0).toLocaleString()}
        />
        <Stat label="Call minutes" value={String(portal.usage?.call_minutes_used ?? 0)} />
        <Stat label="SMS sent" value={String(portal.usage?.sms_count_used ?? 0)} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: (() => void) | undefined;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-between font-bold">
        {value}
        {action && (
          <Button size="icon" variant="ghost" onClick={action}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Inbox({
  automationId,
  conversations,
}: {
  automationId: string;
  conversations: Awaited<ReturnType<typeof getMyAutomationPortal>>["conversations"];
}) {
  const [sel, setSel] = useState<string | null>(null);
  const msgs = useQuery({
    queryKey: ["portal-messages", sel, automationId],
    enabled: !!sel,
    queryFn: () => getConversationMessages({ data: { conversationId: sel!, automationId } }),
  });
  const current = conversations.find((c) => c.id === sel);
  const lead = (current?.extracted_lead_data ?? {}) as Record<string, string>;
  return (
    <div className="grid min-h-96 gap-4 lg:grid-cols-[260px_1fr_220px]">
      <div className="grid content-start gap-2">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className={`rounded-xl border p-3 text-left text-sm ${sel === c.id ? "border-primary" : "border-border"}`}
          >
            <div className="font-semibold">{c.customer_phone_or_id ?? "Visitor"}</div>
            <div className="text-xs text-muted-foreground">
              {c.channel} · {timeAgo(c.created_at)}
            </div>
          </button>
        ))}
        {conversations.length === 0 && (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        {current ? (
          <div className="grid gap-3">
            <StatusPill status={current.status} />
            {current.audio_recording_url && (
              <audio controls src={current.audio_recording_url} className="w-full" />
            )}
            {(msgs.data ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "assistant" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground"}`}
              >
                {m.content}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a conversation.</p>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h3 className="mb-2 font-bold">Extracted Lead Data</h3>
        {["name", "phone", "email", "intent", "budget"].map((k) => (
          <div key={k} className="flex justify-between border-b border-border py-1.5">
            <span className="capitalize text-muted-foreground">{k}</span>
            <span className="font-semibold">{lead[k] ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Knowledge({
  automationId,
  clientId,
  documents,
  crawlJobs,
  refresh,
}: {
  automationId: string;
  clientId: string;
  documents: Awaited<ReturnType<typeof getMyAutomationPortal>>["knowledge"];
  crawlJobs: Awaited<ReturnType<typeof getMyAutomationPortal>>["crawlJobs"];
  refresh: () => void;
}) {
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  async function scrape() {
    if (!/^https?:\/\//.test(url)) {
      toast.error("Enter a full URL starting with https://");
      return;
    }
    try {
      await createCrawlJob({ data: { automationId, url } });
      toast.success("Scrape queued");
      setUrl("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue scrape.");
    }
  }
  async function upload(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`${file.name} is over 2MB for direct text ingestion`);
        continue;
      }
      if (file.type === "application/pdf") {
        toast.error(
          "PDF ingestion is queued through the server; upload the PDF through the API gateway in the production deployment.",
        );
        continue;
      }
      const content = (await file.text()).slice(0, 200000);
      try {
        await saveManualKnowledgeDocument({
          data: { automationId, sourceName: file.name, content, sourceType: "manual_text" },
        });
        toast.success(`${file.name} queued for indexing`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}.`);
      }
    }
    refresh();
  }
  async function remove(docId: string) {
    try {
      await deleteKnowledgeDocument({ data: { automationId, documentId: docId } });
      toast.success("Document removed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove document.");
    }
  }
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <Input
          placeholder="https://yourbusiness.com/menu"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button onClick={scrape}>Scrape Website</Button>
      </div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-10 text-sm ${drag ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" /> Drop text or markdown files here,
        or click to choose
        <input
          type="file"
          multiple
          accept=".txt,.md,.csv"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </label>
      {crawlJobs.length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 font-bold">Scrape jobs</h3>
          {crawlJobs.map((j) => (
            <div key={j.id} className="flex justify-between py-1">
              <span>{j.target_url}</span>
              <StatusPill status={j.status} />
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2">
        {documents.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"
          >
            <span className="flex-1 font-semibold">{d.source_name}</span>
            <span className="text-xs text-muted-foreground">
              {d.source_type} · {timeAgo(d.created_at)}
            </span>
            {d.source_type !== "override_rule" && (
              <Button size="icon" variant="ghost" onClick={() => void remove(d.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Features({
  automationId,
  type,
  tasks,
  refresh,
}: {
  automationId: string;
  type: string;
  tasks: PortalData["tasks"];
  refresh: () => void;
}) {
  const list = type === "messaging_ai" ? MESSAGING_FEATURES : RECEPTIONIST_CAPABILITIES;
  const byKey = new Map(tasks.map((t) => [t.task_key, t]));
  async function toggle(key: string, enabled: boolean) {
    try {
      await updateAutomationTask({ data: { automationId, taskKey: key, enabled } });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update feature.");
    }
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((c) => (
        <div key={c.key} className="flex items-start gap-3 rounded-xl border border-border p-3">
          <div className="flex-1">
            <div className="text-sm font-bold">{c.label}</div>
            <div className="text-xs text-muted-foreground">{c.desc}</div>
          </div>
          <Switch
            checked={byKey.get(c.key)?.enabled ?? false}
            onCheckedChange={(v) => void toggle(c.key, v)}
          />
        </div>
      ))}
    </div>
  );
}

function Integrations({
  automationId,
  connections,
}: {
  automationId: string;
  clientId: string;
  connections: Awaited<ReturnType<typeof getMyAutomationPortal>>["integrations"];
}) {
  const connected = new Map(
    connections.filter((s) => s.status === "connected").map((s) => [s.provider, s]),
  );
  const [provider, setProvider] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fieldSets: Record<string, { key: string; label: string; secret?: boolean }[]> = {
    twilio: [
      { key: "accountSid", label: "Account SID" },
      { key: "authToken", label: "Auth token", secret: true },
      { key: "fromNumber", label: "From number" },
      { key: "apiKeySid", label: "API key SID" },
      { key: "apiKeySecret", label: "API key secret", secret: true },
      { key: "messagingServiceSid", label: "Messaging Service SID" },
    ],
    whatsapp: [
      { key: "accessToken", label: "Meta access token", secret: true },
      { key: "phoneNumberId", label: "Phone number ID" },
    ],
    meta_page: [
      { key: "accessToken", label: "Meta access token", secret: true },
      { key: "pageId", label: "Facebook Page ID" },
    ],
    messenger: [
      { key: "accessToken", label: "Meta access token", secret: true },
      { key: "pageId", label: "Facebook Page ID" },
    ],
    instagram: [
      { key: "accessToken", label: "Meta access token", secret: true },
      { key: "instagramBusinessAccountId", label: "Instagram business account ID" },
    ],
    google_calendar: [
      { key: "accessToken", label: "Google access token", secret: true },
      { key: "refreshToken", label: "Google refresh token", secret: true },
      { key: "clientId", label: "OAuth client ID" },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
      { key: "calendarId", label: "Calendar ID (optional)" },
    ],
  };
  const labels: Record<string, string> = {
    twilio: "Twilio Voice & SMS",
    whatsapp: "WhatsApp Business",
    meta_page: "Meta Facebook Page",
    messenger: "Messenger",
    instagram: "Instagram",
    google_calendar: "Google Calendar",
  };
  async function save() {
    if (!provider) return;
    setSaving(true);
    try {
      await saveAutomationIntegration({
        data: { automationId, provider: provider as never, credentials: fields, scopes: [] },
      });
      toast.success(`${labels[provider]} connected`);
      setProvider(null);
      setFields({});
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect integration");
    } finally {
      setSaving(false);
    }
  }
  async function remove(key: string) {
    try {
      await removeAutomationIntegration({ data: { automationId, provider: key } });
      toast.success("Integration disconnected");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect integration");
    }
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Object.keys(labels).map((key) => (
        <div key={key} className="rounded-2xl border border-border bg-card p-4">
          <div className="font-bold">{labels[key]}</div>
          <div className="my-2">
            <StatusPill status={connected.has(key) ? "connected" : "not connected"} />
          </div>
          {connected.has(key) ? (
            <Button size="sm" variant="outline" onClick={() => void remove(key)}>
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setProvider(key);
                setFields({});
              }}
            >
              Connect
            </Button>
          )}
          {provider === key && (
            <div className="mt-4 grid gap-2">
              {(fieldSets[key] ?? []).map((f) => (
                <Input
                  key={f.key}
                  type={f.secret ? "password" : "text"}
                  placeholder={f.label}
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))}
                />
              ))}
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={() => void save()}>
                  {saving ? "Connecting…" : "Save connection"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setProvider(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      <p className="md:col-span-2 text-xs text-muted-foreground">
        Credentials are encrypted server-side and never rendered back to the browser. External
        provider setup still requires the provider account, approved sender/page/phone assets, and
        the required provider permissions.
      </p>
    </div>
  );
}
