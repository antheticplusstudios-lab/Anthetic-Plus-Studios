import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill, timeAgo } from "@/components/admin-ui";
import { WidgetCustomizer } from "@/components/widget-customizer";
import { AUTOMATION_LABEL } from "@/lib/catalog-v2";
import {
  getMyAutomationPortal,
  getConversationMessages,
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
import { CONFIG_FIELDS, engineKindOf } from "@/lib/automation-config";
import type { EngineKind } from "@/lib/automations";

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
  lead_capture: ["Overview", "Leads CRM", "Settings", "Widget", "Installation"],
  kb_support: ["Overview", "Support Desk", "Knowledge Base", "Settings", "Widget", "Installation"],
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
  const tabs = kind ? (TABS_BY_KIND[kind] ?? ["Overview"]) : ["Overview", "Installation"];

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
        <Integrations automationId={id} connections={pd.integrations} providers={["twilio", "google_calendar"]} refresh={refresh} />
      )}
      {tab === "Channels" && kind === "messaging_ai" && (
        <Integrations automationId={id} connections={pd.integrations} providers={["whatsapp", "meta_page", "messenger", "instagram"]} refresh={refresh} />
      )}
      {tab === "Widget" && <WidgetCustomizer automationId={id} initial={a.widget_config} onSaved={refresh} />}
      {tab === "Installation" && <Installation automationId={id} domain={a.domain_url} refresh={refresh} />}
    </div>
  );
}

type PortalData = Awaited<ReturnType<typeof getMyAutomationPortal>>;

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function Overview({ portal, kind }: { portal: PortalData; kind: EngineKind | null; refresh: () => void }) {
  const a = portal.automation;
  const leads = portal.leads;
  const openTickets = portal.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const hotLeads = leads.filter((lead) => lead.lead_score >= Number(portal.automation.settings?.["hot_threshold"] ?? 60)).length;
  const connected = portal.integrations.filter((item) => item.status === "connected").length;
  const cards: [string, string | number, string][] =
    kind === "ai_receptionist"
      ? [
          ["Calls & conversations", portal.conversations.length, "Recent caller activity"],
          ["Appointments", portal.appointments.length, "Bookings recorded by the receptionist"],
          ["Call minutes", Number(portal.usage?.call_minutes_used ?? 0), "This billing period"],
          ["Phone line", a.assigned_phone_number ?? "Not assigned", "Provisioning status"],
        ]
      : kind === "lead_capture"
        ? [
            ["Total leads", leads.length, "Captured by this sales agent"],
            ["Hot leads", hotLeads, "Based on your saved hot-score threshold"],
            ["Qualified", leads.filter((lead) => lead.status === "qualified").length, "Ready for follow-up"],
            ["Conversion wins", leads.filter((lead) => lead.status === "won").length, "Marked won by your team"],
          ]
        : kind === "kb_support"
          ? [
              ["Support conversations", portal.conversations.length, "Recent customer questions"],
              ["Open escalations", openTickets, "Tickets awaiting your team"],
              ["Knowledge sources", portal.knowledge.length, "Documents and indexed sources"],
              ["Crawl jobs", portal.crawlJobs.length, "Recent website ingestion jobs"],
            ]
          : [
              ["Conversations", portal.conversations.length, "Across connected messaging channels"],
              ["Connected channels", connected, "Verified channel connections"],
              ["Leads captured", leads.length, "Contacts collected in conversations"],
              ["Messages sent", Number(portal.usage?.sms_count_used ?? 0), "Usage reported this billing period"],
            ];
  const descriptions: Record<EngineKind, string> = {
    ai_receptionist: "Monitor caller activity, bookings, phone connectivity and the rules that control call handling.",
    lead_capture: "Review new prospects, prioritize hot leads, update pipeline stages and tune qualification rules.",
    kb_support: "Keep answers grounded in approved knowledge, review escalations and resolve customer issues.",
    messaging_ai: "Manage your connected social channels, monitor conversations and control your brand voice.",
  };
  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="text-lg font-extrabold">Workspace overview</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          {kind ? descriptions[kind] : "Manage your automation and monitor its activity."}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, note]) => <Metric key={String(label)} label={String(label)} value={value} note={String(note)} />)}
        </div>
      </section>
      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-bold">Automation health</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Runtime state</p><p className="mt-1 font-semibold capitalize">{String(a.run_state ?? a.status ?? "unknown").replace(/_/g, " ")}</p></div>
          <div><p className="text-xs text-muted-foreground">Last successful activity</p><p className="mt-1 font-semibold">{a.last_success_at ? new Date(a.last_success_at).toLocaleString() : "No successful run recorded"}</p></div>
          <div><p className="text-xs text-muted-foreground">Subscription</p><p className="mt-1 font-semibold capitalize">{String(portal.subscription?.status ?? a.status ?? "unknown").replace(/_/g, " ")}</p></div>
        </div>
        {a.last_error && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{a.last_error}</p>}
      </section>
    </div>
  );
}

function Installation({ automationId, domain, refresh }: { automationId: string; domain: string; refresh: () => void }) {
  const [snippet, setSnippet] = useState("");
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const result = await generateMyInstallScript({ data: { automationId } });
      setSnippet(result.snippet);
      refresh();
      toast.success("A new installation script is ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the installation script.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="text-lg font-extrabold">Install on your website</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate a domain-bound script for {domain || "your registered website"}. Generating a new script rotates the previous token, so replace the old snippet when reinstalling.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void generate()} disabled={busy}>{busy ? "Generating…" : "Generate new script"}</Button>
        {snippet && <Button variant="outline" onClick={() => copy(snippet)}><Copy className="h-4 w-4" /> Copy script</Button>}
      </div>
      {snippet ? (
        <pre className="mt-4 overflow-x-auto rounded-xl bg-muted p-4 text-xs"><code>{snippet}</code></pre>
      ) : (
        <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">For security, the raw token is not stored for later display. Generate a script when you need to install or reinstall.</p>
      )}
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Copy the generated script.</li>
        <li>Paste it immediately before the closing body tag on your registered domain.</li>
        <li>Publish your website, then return here to check installation status.</li>
      </ol>
    </section>
  );
}

function AutomationSettings({
  automationId, kind, initial, refresh,
}: { automationId: string; kind: EngineKind; initial: Record<string, unknown>; refresh: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(CONFIG_FIELDS[kind].map((field) => [field.key, String(initial[field.key] ?? "")])),
  );
  const [saving, setSaving] = useState(false);
  const fields = CONFIG_FIELDS[kind];
  async function save() {
    setSaving(true);
    try {
      await saveMyAutomationSettings({ data: { automationId, settings: values } });
      toast.success("Automation settings saved");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save automation settings.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Automation behaviour</h2>
          <p className="mt-1 text-sm text-muted-foreground">These settings are applied by the automation runtime. Save changes when finished.</p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {fields.map((field) => {
          const value = values[field.key] ?? "";
          const wide = !!field.long;
          return (
            <label key={field.key} className={wide ? "grid gap-1.5 md:col-span-2" : "grid gap-1.5"}>
              <span className="text-sm font-semibold">{field.label}</span>
              {field.help && <span className="text-xs leading-5 text-muted-foreground">{field.help}</span>}
              {wide ? (
                <Textarea rows={4} value={value} maxLength={8000} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
              ) : (
                <Input
                  type={field.key === "notify_email" ? "email" : field.key === "webhook_url" ? "url" : field.kind === "number" ? "number" : "text"}
                  min={field.kind === "number" ? 0 : undefined}
                  max={["hot_threshold", "warm_threshold"].includes(field.key) ? 100 : field.key === "confidence_threshold" ? 1 : field.key === "voice_rate" ? 2 : undefined}
                  step={field.key === "confidence_threshold" || field.key === "voice_rate" ? "0.05" : "1"}
                  value={value}
                  maxLength={8000}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </section>
  );
}

function Leads({ automationId, rows, refresh }: { automationId: string; rows: PortalData["leads"]; refresh: () => void }) {
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const filtered = filter === "all" ? rows : rows.filter((lead) => lead.status === filter);
  async function changeStatus(leadId: string, status: "new" | "qualified" | "contacted" | "won" | "lost" | "archived") {
    setBusyId(leadId);
    try {
      await updateMyLeadStatus({ data: { automationId, leadId, status } });
      toast.success("Lead status updated");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update lead.");
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-extrabold">Lead pipeline</h2><p className="text-sm text-muted-foreground">{rows.length} leads captured by this automation</p></div>
        <select className="h-10 rounded-xl border border-border bg-background px-3 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)}>
          {["all", "new", "qualified", "contacted", "won", "lost", "archived"].map((status) => <option key={status} value={status}>{status === "all" ? "All stages" : status}</option>)}
        </select>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground"><tr>{["Lead", "Intent / summary", "Source", "Score", "Captured", "Pipeline stage"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {filtered.map((lead) => (
              <tr key={lead.id}>
                <td className="px-3 py-3"><p className="font-semibold">{lead.name || "Unnamed lead"}</p><p className="text-xs text-muted-foreground">{lead.email || lead.phone || "No contact details"}</p></td>
                <td className="max-w-[240px] px-3 py-3"><p className="font-medium">{lead.intent || "—"}</p><p className="line-clamp-2 text-xs text-muted-foreground">{lead.summary}</p></td>
                <td className="px-3 py-3 text-muted-foreground">{lead.source || "—"}</td>
                <td className="px-3 py-3 font-bold tabular-nums">{lead.lead_score}/100</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(lead.captured_at || lead.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-3">
                  <select aria-label={`Stage for ${lead.name || "lead"}`} className="h-9 rounded-lg border border-border bg-background px-2 text-xs" disabled={busyId === lead.id} value={lead.status} onChange={(event) => void changeStatus(lead.id, event.target.value as "new" | "qualified" | "contacted" | "won" | "lost" | "archived")}>
                    {["new", "qualified", "contacted", "won", "lost", "archived"].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">No leads in this stage yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Appointments({ automationId, rows, refresh }: { automationId: string; rows: PortalData["appointments"]; refresh: () => void }) {
  const [busyId, setBusyId] = useState("");
  async function changeStatus(appointmentId: string, status: "booked" | "completed" | "canceled" | "no_show" | "rescheduled") {
    setBusyId(appointmentId);
    try {
      await updateMyAppointmentStatus({ data: { automationId, appointmentId, status } });
      toast.success("Booking status updated");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update booking.");
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="text-lg font-extrabold">Appointments</h2>
      <p className="mt-1 text-sm text-muted-foreground">Bookings created through this receptionist. Update the status after the customer is served.</p>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4">
            <div className="min-w-0"><p className="font-semibold">{row.visitor_name || "Customer"}</p><p className="text-xs text-muted-foreground">{new Date(row.starts_at).toLocaleString()} · {row.visitor_phone || row.visitor_email || "No contact"}</p>{row.notes && <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>}</div>
            <select aria-label={`Booking status for ${row.visitor_name || "customer"}`} className="h-9 rounded-lg border border-border bg-background px-2 text-xs" disabled={busyId === row.id} value={row.status} onChange={(event) => void changeStatus(row.id, event.target.value as "booked" | "completed" | "canceled" | "no_show" | "rescheduled")}>
              {["booked", "completed", "canceled", "no_show", "rescheduled"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
            </select>
          </article>
        ))}
        {rows.length === 0 && <p className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">No appointments have been recorded yet.</p>}
      </div>
    </section>
  );
}

function Tickets({ automationId, rows, refresh }: { automationId: string; rows: PortalData["tickets"]; refresh: () => void }) {
  const [busyId, setBusyId] = useState("");
  async function changeStatus(ticketId: string, status: "open" | "assigned" | "resolved" | "closed") {
    setBusyId(ticketId);
    try {
      await updateMyTicketStatus({ data: { automationId, ticketId, status } });
      toast.success("Support ticket updated");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update ticket.");
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="text-lg font-extrabold">Escalations & support tickets</h2>
      <p className="mt-1 text-sm text-muted-foreground">Questions the AI could not safely resolve, or that matched your handoff rules.</p>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{row.visitor_contact || "Customer"}</p><p className="mt-1 text-sm text-muted-foreground">{row.reason.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()} · Sentiment {Number(row.sentiment).toFixed(2)}</p></div>
              <select aria-label="Ticket status" className="h-9 rounded-lg border border-border bg-background px-2 text-xs" disabled={busyId === row.id} value={row.status} onChange={(event) => void changeStatus(row.id, event.target.value as "open" | "assigned" | "resolved" | "closed")}>
                {["open", "assigned", "resolved", "closed"].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </article>
        ))}
        {rows.length === 0 && <p className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">No escalations waiting for your team.</p>}
      </div>
    </section>
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

function Integrations({
  automationId,
  connections,
  providers,
  refresh,
}: {
  automationId: string;
  connections: Awaited<ReturnType<typeof getMyAutomationPortal>>["integrations"];
  providers: string[];
  refresh: () => void;
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
      refresh();
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
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect integration");
    }
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {providers.map((key) => (
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
