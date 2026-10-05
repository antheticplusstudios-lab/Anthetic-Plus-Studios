import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusPill, timeAgo } from "@/components/admin-ui";
import { WidgetCustomizer } from "@/components/widget-customizer";
import { AUTOMATION_LABEL, MESSAGING_FEATURES, RECEPTIONIST_CAPABILITIES } from "@/lib/catalog-v2";
import { getMyAutomationPortal, getConversationMessages, updateAutomationTask, createCrawlJob, deleteKnowledgeDocument, saveManualKnowledgeDocument, getIntegrationStatus, generateMyInstallScript } from "@/lib/client-platform.functions";

export const Route = createFileRoute("/_authenticated/dashboard/portal/$id")({
  head: () => ({ meta: [{ title: "Automation Portal — AntheticPlus" }] }),
  component: PortalPage,
});

const TABS = ["Overview", "Inbox & CRM", "Knowledge Base", "Features", "Widget", "Integrations"] as const;
const FASTAPI_BASE = String(import.meta.env.VITE_API_GATEWAY_URL ?? "").replace(/\/$/, "");

function copy(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success("Copied");
}

function PortalPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const portal = useQuery({ queryKey: ["automation-portal", id], queryFn: () => getMyAutomationPortal({ data: { automationId: id } }) });
  const qc = useQueryClient();
  const a = portal.data?.automation as any;
  const pd = portal.data as any;
  if (!a || !pd) return <p className="text-muted-foreground">{portal.isError ? "Automation not found." : "Loading…"}</p>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["automation-portal", id] });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{AUTOMATION_LABEL[a.automation_type] ?? a.name ?? a.automation_type}</h1>
        <p className="text-sm text-muted-foreground">{a.domain_url} · {a.client_id} · {a.order_id ?? "—"}</p>
      </div>
      {a.requires_reinstallation && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4" /> Your settings changed and the script was rotated. Generate and reinstall the new snippet below.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t} size="sm" variant={t === tab ? "default" : "outline"} onClick={() => setTab(t)}>{t}</Button>
        ))}
      </div>
      {tab === "Overview" && <Overview portal={pd} refresh={refresh} />}
      {tab === "Inbox & CRM" && <Inbox automationId={id} conversations={pd.conversations} />}
      {tab === "Knowledge Base" && <Knowledge automationId={id} clientId={a.client_id} documents={pd.knowledge} crawlJobs={pd.crawlJobs} refresh={refresh} />}
      {tab === "Features" && <Features automationId={id} type={a.automation_type} tasks={pd.tasks} refresh={refresh} />}
      {tab === "Widget" && <WidgetCustomizer automationId={id} initial={a.widget_config} onSaved={refresh} />}
      {tab === "Integrations" && <Integrations automationId={id} clientId={a.client_id} connections={pd.integrations} />}
    </div>
  );
}

type PortalData = Awaited<ReturnType<typeof getMyAutomationPortal>>;

function Overview({ portal, refresh }: { portal: PortalData; refresh: () => void }) {
  const a = portal.automation as any;
  const [snippet, setSnippet] = useState("");
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try { const result = await generateMyInstallScript({ data: { automationId: a.id } }); setSnippet(result.snippet); refresh(); toast.success("New installation script generated"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not generate script."); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Install script</h2><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void generate()} disabled={busy}>{busy ? "Generating…" : "Generate script"}</Button>{snippet && <Button size="sm" variant="outline" onClick={() => copy(snippet)}><Copy className="h-4 w-4" /> Copy</Button>}</div></div>
        {snippet ? <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">{snippet}</pre> : <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">For security, raw installation tokens are not retained. Generate a script when you need to install or reinstall this automation.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Paste before the closing body tag. Generating a new script invalidates the previous token.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Phone number" value={a.assigned_phone_number ?? "Not assigned"} action={a.assigned_phone_number ? () => copy(a.assigned_phone_number!) : undefined} />
        <Stat label="Tokens this month" value={Number((portal.usage as any)?.tokens_used ?? 0).toLocaleString()} />
        <Stat label="Call minutes" value={String((portal.usage as any)?.call_minutes_used ?? 0)} />
        <Stat label="SMS sent" value={String((portal.usage as any)?.sms_count_used ?? 0)} />
      </div>
    </div>
  );
}

function Stat({ label, value, action }: { label: string; value: string; action?: (() => void) | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-between font-bold">{value}{action && <Button size="icon" variant="ghost" onClick={action}><Copy className="h-4 w-4" /></Button>}</div>
    </div>
  );
}

function Inbox({ automationId, conversations }: { automationId: string; conversations: any[] }) {
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
          <button key={c.id} onClick={() => setSel(c.id)} className={`rounded-xl border p-3 text-left text-sm ${sel === c.id ? "border-primary" : "border-border"}`}>
            <div className="font-semibold">{c.customer_phone_or_id ?? "Visitor"}</div>
            <div className="text-xs text-muted-foreground">{c.channel} · {timeAgo(c.created_at)}</div>
          </button>
        ))}
        {conversations.length === 0 && <p className="text-sm text-muted-foreground">No conversations yet.</p>}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        {current ? (
          <div className="grid gap-3">
            <StatusPill status={current.status} />
            {current.audio_recording_url && <audio controls src={current.audio_recording_url} className="w-full" />}
            {(msgs.data ?? []).map((m: any) => (
              <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "assistant" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground"}`}>{m.content}</div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Select a conversation.</p>}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h3 className="mb-2 font-bold">Extracted Lead Data</h3>
        {["name", "phone", "email", "intent", "budget"].map((k) => (
          <div key={k} className="flex justify-between border-b border-border py-1.5"><span className="capitalize text-muted-foreground">{k}</span><span className="font-semibold">{lead[k] ?? "—"}</span></div>
        ))}
      </div>
    </div>
  );
}

function Knowledge({ automationId, clientId, documents, crawlJobs, refresh }: { automationId: string; clientId: string; documents: any[]; crawlJobs: any[]; refresh: () => void }) {
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  async function scrape() {
    if (!/^https?:\/\//.test(url)) { toast.error("Enter a full URL starting with https://"); return; }
    try { await createCrawlJob({ data: { automationId, url } }); toast.success("Scrape queued"); setUrl(""); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not queue scrape."); }
  }
  async function upload(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      if (file.size > 2 * 1024 * 1024) { toast.error(`${file.name} is over 2MB for direct text ingestion`); continue; }
      if (file.type === "application/pdf") { toast.error("PDF ingestion is queued through the server; upload the PDF through the API gateway in the production deployment."); continue; }
      const content = (await file.text()).slice(0, 200000);
      try { await saveManualKnowledgeDocument({ data: { automationId, sourceName: file.name, content, sourceType: "manual_text" } }); toast.success(`${file.name} queued for indexing`); }
      catch (e) { toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}.`); }
    }
    refresh();
  }
  async function remove(docId: string) {
    try { await deleteKnowledgeDocument({ data: { automationId, documentId: docId } }); toast.success("Document removed"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove document."); }
  }
  return (
    <div className="grid gap-4">
      <div className="flex gap-2"><Input placeholder="https://yourbusiness.com/menu" value={url} onChange={(e) => setUrl(e.target.value)} /><Button onClick={scrape}>Scrape Website</Button></div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
        className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-10 text-sm ${drag ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" /> Drop text or markdown files here, or click to choose
        <input type="file" multiple accept=".txt,.md,.csv" className="hidden" onChange={(e) => void upload(e.target.files)} />
      </label>
      {crawlJobs.length > 0 && (
        <div className="text-sm"><h3 className="mb-1 font-bold">Scrape jobs</h3>{crawlJobs.map((j) => <div key={j.id} className="flex justify-between py-1"><span>{j.target_url}</span><StatusPill status={j.status} /></div>)}</div>
      )}
      <div className="grid gap-2">
        {documents.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <span className="flex-1 font-semibold">{d.source_name}</span><span className="text-xs text-muted-foreground">{d.source_type} · {timeAgo(d.created_at)}</span>
            {d.source_type !== "override_rule" && <Button size="icon" variant="ghost" onClick={() => void remove(d.id)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Features({ automationId, type, tasks, refresh }: { automationId: string; type: string; tasks: any[]; refresh: () => void }) {
  const list = type === "messaging_ai" ? MESSAGING_FEATURES : RECEPTIONIST_CAPABILITIES;
  const byKey = new Map(tasks.map((t: any) => [t.task_key, t]));
  async function toggle(key: string, enabled: boolean) {
    try { await updateAutomationTask({ data: { automationId, taskKey: key, enabled } }); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update feature."); }
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((c) => (
        <div key={c.key} className="flex items-start gap-3 rounded-xl border border-border p-3">
          <div className="flex-1"><div className="text-sm font-bold">{c.label}</div><div className="text-xs text-muted-foreground">{c.desc}</div></div>
          <Switch checked={byKey.get(c.key)?.enabled ?? false} onCheckedChange={(v) => void toggle(c.key, v)} />
        </div>
      ))}
    </div>
  );
}

function Integrations({ automationId, clientId, connections }: { automationId: string; clientId: string; connections: any[] }) {
  const connected = new Set(connections.filter((s) => s.status === "connected").map((s) => s.provider));
  const items = [
    { key: "google_calendar", label: "Google Calendar", href: `${FASTAPI_BASE}/v1/auth/google/login?client_id=${encodeURIComponent(clientId)}&automation_id=${encodeURIComponent(automationId)}` },
    { key: "meta_page", label: "Meta Facebook Page", href: `${FASTAPI_BASE}/v1/auth/meta/login?client_id=${encodeURIComponent(clientId)}&automation_id=${encodeURIComponent(automationId)}` },
    { key: "whatsapp", label: "WhatsApp Business", href: `${FASTAPI_BASE}/v1/auth/whatsapp/login?client_id=${encodeURIComponent(clientId)}&automation_id=${encodeURIComponent(automationId)}` },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.key} className="rounded-2xl border border-border bg-card p-4">
          <div className="font-bold">{i.label}</div>
          <div className="my-2"><StatusPill status={connected.has(i.key) ? "connected" : "not connected"} /></div>
          <Button asChild size="sm" variant={connected.has(i.key) ? "outline" : "default"}><a href={i.href}>{connected.has(i.key) ? "Reconnect" : "Connect"}</a></Button>
        </div>
      ))}
    </div>
  );
}

