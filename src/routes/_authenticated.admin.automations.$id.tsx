import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, DataTable, Loading, Panel, StatCard, money, shortDate, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  automationAction,
  generateScript,
  getAutomationDetail,
  getConversationMessages,
  runDiagnostics,
  saveWidgetConfig,
  testAutomation,
} from "@/lib/command-center.functions";
import { cn } from "@/lib/utils";
import { DEFAULT_WIDGET_CONFIG, normalizeWidgetConfig, type WidgetConfig } from "@/lib/widget-config";

export const Route = createFileRoute("/_authenticated/admin/automations/$id")({
  head: () => ({
    meta: [
      { title: "Automation Control Center — AntheticPlus" },
      { name: "description", content: "Full control of one automation: runtime, health, widget, knowledge, channels, conversations, logs and audit." },
      { property: "og:title", content: "Automation Control Center — AntheticPlus" },
      { property: "og:description", content: "Full control of one AntheticPlus automation." },
    ],
  }),
  component: ControlCenter,
});

type Row = Record<string, any>;

const TABS = [
  "Overview", "Client", "Domain", "Product", "Health", "Subscription", "Usage", "Installation", "Script",
  "Widget", "AI Configuration", "Prompt/Behavior", "Knowledge", "Channels", "Phone", "Integrations",
  "API Providers", "LLM Configuration", "Tasks/Capabilities", "Round-Robin", "Workflow Automation", "Conversations", "Leads",
  "Logs", "Diagnostics", "Security", "Audit",
] as const;
type Tab = (typeof TABS)[number];

const ACTIONS = [
  { key: "enable", label: "Enable" },
  { key: "disable", label: "Disable" },
  { key: "pause", label: "Pause" },
  { key: "resume", label: "Resume" },
  { key: "stop", label: "Stop" },
  { key: "reinstall", label: "Require reinstall" },
  { key: "rotate_token", label: "Rotate token" },
  { key: "rotate_hmac", label: "Rotate webhook secret" },
] as const;

const WIDGET_STATE_KEYS = ["idle", "listening", "thinking", "speaking", "message", "success", "handoff", "error", "offline"] as const;
type WidgetCfg = WidgetConfig;

function MetalBallsPreview({ c }: { c: WidgetCfg }) {
  const balls = Array.from({ length: c.ballCount });
  const diameter = Math.max(44, Math.min(132, c.size));
  const radius = Math.max(8, Math.min(60, c.radius));
  const ballSize = Math.max(1, Math.min(12, c.ballSize));
  const centerSize = Math.max(3, Math.min(70, c.centerSize));
  const tiltScale = 0.35 + Math.abs(Math.sin((c.tilt * Math.PI) / 180)) * 0.65;
  return (
    <div className="relative grid place-items-center rounded-2xl border border-border bg-black/5" style={{ minHeight: 250 }}>
      <div
        className="relative"
        style={{
          width: diameter,
          height: diameter,
          filter: `drop-shadow(0 8px 24px ${c.glow}88)`,
          transform: `rotateX(${c.tilt}deg)`,
        }}
      >
        {balls.map((_, i) => {
          const angle = (i / Math.max(1, c.ballCount)) * Math.PI * 2;
          const r = radius * (1 + (i % 2 ? c.variation : -c.variation));
          const x = diameter / 2 + Math.cos(angle) * r;
          const y = diameter / 2 + Math.sin(angle) * r * tiltScale;
          const color = i % 2 ? c.secondary : c.primary;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: ballSize,
                height: ballSize,
                left: x,
                top: y,
                transform: "translate(-50%,-50%)",
                background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,${c.shine ? 0.9 : 0.2}), ${color} 65%, ${c.glow})`,
                boxShadow: `0 0 ${Math.max(3, ballSize * 2)}px ${c.glow}88`,
                opacity: c.stateAnimations.idle?.enabled === false ? 0.55 : 1,
              }}
            />
          );
        })}
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: centerSize,
            height: centerSize,
            transform: "translate(-50%,-50%)",
            background: `radial-gradient(circle at 35% 30%, #ffffff, ${c.center} 55%, ${c.glow})`,
            boxShadow: `0 0 ${Math.max(10, centerSize * 0.8)}px ${c.glow}aa`,
          }}
        />
      </div>
      <span className="absolute bottom-3 text-[11px] text-muted-foreground">Metal Balls · {c.ballCount} particles</span>
    </div>
  );
}

function ControlCenter() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [snippet, setSnippet] = useState("");
  const [testMsg, setTestMsg] = useState("Hello, this is a production test.");
  const [testResult, setTestResult] = useState<string>("");
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [cfg, setCfg] = useState<WidgetCfg | null>(null);

  const act = useServerFn(automationAction);
  const diagnose = useServerFn(runDiagnostics);
  const test = useServerFn(testAutomation);
  const genScript = useServerFn(generateScript);
  const saveCfg = useServerFn(saveWidgetConfig);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cc", "automation", id],
    queryFn: () => getAutomationDetail({ data: { id } }),
  });
  const { data: msgs } = useQuery({
    queryKey: ["cc", "conv", openConv],
    queryFn: () => getConversationMessages({ data: { conversationId: openConv! } }),
    enabled: !!openConv,
  });

  if (isLoading) return <Loading label="Loading automation" />;
  if (error) return <Panel title="Automation unavailable">{(error as Error).message}</Panel>;
  if (!data) return <Panel title="Not found">This automation does not exist.</Panel>;

  const a = data.automation as Row;
  const health = (data.health ?? null) as Row | null;
  const config: WidgetCfg = cfg ?? normalizeWidgetConfig(a["widget_config"]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["cc", "automation", id] });

  const run = async (key: (typeof ACTIONS)[number]["key"]) => {
    setBusy(key);
    try {
      await act({ data: { id, action: key, reason: reason.trim() } });
      toast.success(`${key.replace(/_/g, " ")} applied`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const runDiag = async () => {
    setBusy("diag");
    try {
      const r = await diagnose({ data: { id } });
      toast.success(`Health: ${r.overall} (${r.checks} checks)`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const runTest = async () => {
    setBusy("test");
    setTestResult("");
    try {
      const r = await test({ data: { id, message: testMsg } });
      setTestResult(r.error ? `HTTP ${r.status} · ${String(r.error)}` : `HTTP ${r.status} · ${r.latencyMs}ms · ${String(r.reply ?? "")}`);
    } catch (e) {
      setTestResult((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const saveWidget = async () => {
    setBusy("widget");
    try {
      await saveCfg({ data: { id, config } });
      toast.success("Widget configuration saved — the production widget uses it immediately.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const num = (k: keyof WidgetCfg, min: number, max: number, step: number) => {
    const value = config[k];
    return (
      <label key={String(k)} className="block text-xs font-semibold text-muted-foreground">
        {String(k)}
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={typeof value === "number" ? value : Number(value)}
          onChange={(e) => setCfg({ ...config, [k]: Number(e.target.value) } as WidgetCfg)}
          className="mt-1"
        />
      </label>
    );
  };
  const color = (k: "primary" | "secondary" | "center" | "glow") => (
    <label key={k} className="block text-xs font-semibold text-muted-foreground">
      {k}
      <Input type="color" value={config[k]} onChange={(e) => setCfg({ ...config, [k]: e.target.value } as WidgetCfg)} className="mt-1 h-10 p-1" />
    </label>
  );

  return (
    <AdminPage
      title={`${String(a["automation_type"]).replace(/_/g, " ")} · ${a["domain_url"] || "no domain"}`}
      subtitle={`Client ${a["client_id"]} · runtime ${data.runtime || "unknown"} · ${data.origin.label} · token …${a["token_hint"]}`}
      actions={
        <Link to="/admin/automations" className="text-sm font-semibold text-primary underline">
          Back to fleet
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Runtime eligibility"
          value={data.runtime || "unknown"}
          tone={data.runtime === "active" ? "good" : "bad"}
          hint={a["is_active"] ? "Switch on" : "Switch off"}
        />
        <StatCard
          label="Health"
          value={String(health?.["overall"] ?? "UNCHECKED")}
          tone={health?.["overall"] === "HEALTHY" ? "good" : health?.["overall"] ? "bad" : "warn"}
          hint={health?.["checked_at"] ? `checked ${timeAgo(String(health["checked_at"]))}` : "never checked"}
        />
        <StatCard
          label="Expires"
          value={a["expires_at"] ? shortDate(String(a["expires_at"])) : "—"}
          hint={a["requires_reinstallation"] ? "Reinstall required" : (data.installations as Row[]).some((x) => x.status === "active") ? "Installed" : "Not installed"}
        />
        <StatCard label="Conversations" value={data.conversations.length} hint={`${data.leads.length} with lead data`} />
      </div>

      <Panel title="Privileged actions" description="Every action is re-authorized server-side and written to the audit log.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (stored in the audit entry)" />
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.map((x) => (
            <Button key={x.key} size="sm" variant="outline" disabled={!!busy} onClick={() => void run(x.key)}>
              {busy === x.key ? "Working…" : x.label}
            </Button>
          ))}
          <Button size="sm" disabled={!!busy} onClick={() => void runDiag()}>
            {busy === "diag" ? "Checking…" : "Run diagnostics"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={async () => {
              try {
                const r = await genScript({ data: { id } });
                setSnippet(r.snippet);
                toast.success("Fresh install snippet generated — the old token is revoked.");
                await refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Regenerate install script
          </Button>
        </div>
        {snippet && <pre className="mt-4 overflow-x-auto rounded-xl bg-muted p-4 text-xs">{snippet}</pre>}
        <div className="mt-5 flex flex-wrap items-end gap-2">
          <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="sm:max-w-sm" />
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runTest()}>
            {busy === "test" ? "Testing…" : "Send live test message"}
          </Button>
        </div>
        {testResult && <p className="mt-3 text-xs text-muted-foreground">{testResult}</p>}
      </Panel>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Client & subscription">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Company</dt>
              <dd className="truncate font-semibold">{String(data.profile?.["company_name"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Contact</dt>
              <dd className="truncate font-semibold">{String(data.profile?.["full_name"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Order</dt>
              <dd className="font-mono text-xs">{String(data.order?.["order_id"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-semibold">{data.order ? money(data.order["total_amount"] as number) : "—"}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-semibold">{shortDate(String(a["created_at"]))}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="font-semibold">{String(a["assigned_phone_number"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Webhook secret</dt>
              <dd className="font-semibold">{a["hmac_set"] ? "Set" : "Not set"}</dd>
              <dt className="text-muted-foreground">Last seen</dt>
              <dd className="font-semibold">{a["last_seen_at"] ? timeAgo(String(a["last_seen_at"])) : "never"}</dd>
            </dl>
            {data.profile?.["client_id"] && (
              <Link
                to="/admin/clients/$id"
                params={{ id: String(data.profile["user_id"]) }}
                className="mt-4 inline-block text-xs font-bold text-primary underline"
              >
                Open client record
              </Link>
            )}
          </Panel>
          <Panel title="Usage by billing period">
            <DataTable
              head={["Period", "Tokens", "Call minutes", "SMS"]}
              rows={(data.usage as Row[]).map((u) => [
                String(u["billing_period"]),
                <span key="t" className="tabular-nums">
                  {Number(u["tokens_used"] ?? 0).toLocaleString()}
                </span>,
                <span key="c" className="tabular-nums">
                  {Number(u["call_minutes_used"] ?? 0)}
                </span>,
                <span key="s" className="tabular-nums">
                  {Number(u["sms_count_used"] ?? 0)}
                </span>,
              ])}
              empty="No usage recorded yet."
            />
          </Panel>
          <Panel title="Tasks" className="xl:col-span-2">
            <DataTable
              head={["Task", "Status", "Detail"]}
              rows={(data.tasks as Row[]).map((t) => [
                <span key="t" className="font-semibold capitalize">
                  {String(t["task_type"] ?? t["title"] ?? "task").replace(/_/g, " ")}
                </span>,
                <span key="s" className="capitalize">
                  {String(t["status"])}
                </span>,
                <span key="d" className="text-xs text-muted-foreground">
                  {String(t["notes"] ?? t["description"] ?? "—")}
                </span>,
              ])}
              empty="No provisioning tasks."
            />
          </Panel>
        </div>
      )}

      {tab === "Client" && (
        <Panel title="Client record" description="DB1 identity and organization-backed tenant information.">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Client ID", a["client_id"]],
              ["User ID", data.profile?.["user_id"] ?? data.profile?.["id"]],
              ["Name", data.profile?.["full_name"]],
              ["Company", data.profile?.["company_name"]],
              ["Company email", data.profile?.["company_email"] ?? data.profile?.["email"]],
              ["Signup origin", data.origin.label],
              ["Registered domain", data.profile?.["registered_origin_domain"]],
              ["Profile complete", data.profile?.["profile_completed"] ? "Yes" : "No"],
            ].map(([k,v]) => <div key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 break-all font-semibold">{String(v ?? "—")}</dd></div>)}
          </dl>
        </Panel>
      )}

      {tab === "Domain" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Domain authorization">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Primary domain</dt><dd className="font-semibold break-all">{String(a["domain_url"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Origin domain</dt><dd className="font-semibold break-all">{String(a["origin_domain"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Allowed domains</dt><dd className="font-semibold break-all">{(a["allowed_domains"] as string[] | undefined)?.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Reinstallation</dt><dd className="font-semibold">{a["requires_reinstallation"] ? "Required" : "Not required"}</dd>
            </dl>
          </Panel>
          <Panel title="Installation domain history">
            <DataTable head={["Domain", "Status", "Verified", "Last seen"]} rows={(data.installations as Row[]).map((x) => [String(x.domain), String(x.status), x.verified_at ? timeAgo(String(x.verified_at)) : "—", x.last_seen_at ? timeAgo(String(x.last_seen_at)) : "—"])} empty="No installations recorded." />
          </Panel>
        </div>
      )}

      {tab === "Product" && (
        <Panel title="Product configuration">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Automation type", String(a["automation_type"] ?? "").replace(/_/g, " ")],
              ["Display name", a["name"]],
              ["Runtime state", a["run_state"]],
              ["Active switch", a["is_active"] ? "On" : "Off"],
              ["Assigned phone", a["assigned_phone_number"]],
              ["Widget config version", a["widget_config_version"]],
            ].map(([k,v]) => <div key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold">{String(v ?? "—")}</dd></div>)}
          </dl>
        </Panel>
      )}

      {tab === "Subscription" && (
        <Panel title="Subscription lifecycle" description="Billing state is sourced from DB2; runtime eligibility is evaluated separately.">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Status", data.subscription?.status],
              ["Plan", data.subscription?.plan_slug],
              ["Started", data.subscription?.started_at],
              ["Renewal", data.subscription?.renewal_at],
              ["Expiration", data.subscription?.expires_at],
              ["Grace period", data.subscription?.grace_period_end],
              ["Cancel at", data.subscription?.cancel_at],
              ["Provider", data.subscription?.provider],
            ].map(([k,v]) => <div key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold">{v ? (String(k).toLowerCase().includes("at") || String(k).toLowerCase().includes("started") || String(k).toLowerCase().includes("renewal") || String(k).toLowerCase().includes("expiration") || String(k).toLowerCase().includes("grace") ? shortDate(String(v)) : String(v)) : "—"}</dd></div>)}
          </dl>
        </Panel>
      )}

      {tab === "Usage" && (
        <Panel title="Usage meters">
          <DataTable head={["Period", "Tokens", "Messages", "SMS", "Call minutes", "Workflow runs"]} rows={(data.usage as Row[]).map((u) => [String(u.billing_period), Number(u.tokens_used ?? 0).toLocaleString(), Number(u.messages_count_used ?? 0).toLocaleString(), Number(u.sms_count_used ?? 0).toLocaleString(), Number(u.call_minutes_used ?? 0), Number(u.workflow_runs_used ?? 0)])} empty="No usage meters recorded." />
        </Panel>
      )}

      {tab === "Installation" && (
        <Panel title="Installation lifecycle" description="Install records are historical and are never hard-deleted by credential rotation.">
          <DataTable head={["ID", "Domain", "Status", "Installed", "Verified", "Revoked", "Last seen"]} rows={(data.installations as Row[]).map((x) => [<span key="id" className="font-mono text-xs">{String(x.id).slice(0,8)}…</span>, String(x.domain), String(x.status), x.installed_at ? timeAgo(String(x.installed_at)) : "—", x.verified_at ? timeAgo(String(x.verified_at)) : "—", x.revoked_at ? timeAgo(String(x.revoked_at)) : "—", x.last_seen_at ? timeAgo(String(x.last_seen_at)) : "—"])} empty="No installations have been created." />
        </Panel>
      )}

      {tab === "Script" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Current installation credential">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Token</dt><dd className="font-mono">…{String(a["token_hint"] ?? "")}</dd>
              <dt className="text-muted-foreground">Reinstallation</dt><dd className="font-semibold">{a["requires_reinstallation"] ? "Required" : "Current token active"}</dd>
              <dt className="text-muted-foreground">Script history</dt><dd className="font-semibold">{data.scripts.length}</dd>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">Use Regenerate install script above to mint a new token. Raw credentials are never stored in DB2.</p>
            {snippet && <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-muted p-4 text-xs">{snippet}</pre>}
          </Panel>
          <Panel title="Generation history">
            <DataTable head={["Hint", "Created", "Invalidated", "Reason"]} rows={(data.scripts as Row[]).map((x) => [<span key="h" className="font-mono">{String(x.token_hint ?? "")}</span>, shortDate(String(x.created_at)), x.invalidated_at ? shortDate(String(x.invalidated_at)) : "Active", String(x.invalidated_reason ?? "—")])} empty="No script generations recorded." />
          </Panel>
        </div>
      )}

      {tab === "AI Configuration" && (
        <Panel title="AI runtime configuration" description="Model selection, retrieval, temperature and runtime state from DB3. Provider keys remain hidden.">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Status", data.aiConfig?.status], ["Primary provider", data.aiConfig?.primary_provider], ["Primary model", data.aiConfig?.primary_model],
              ["Temperature", data.aiConfig?.temperature], ["Max tokens", data.aiConfig?.max_tokens], ["Top P", data.aiConfig?.top_p],
              ["Retrieval", data.aiConfig?.retrieval_enabled ? `On · top ${data.aiConfig?.retrieval_top_k}` : "Off"],
              ["Semantic cache", data.aiConfig?.semantic_cache_enabled ? "On" : "Off"], ["Config version", data.aiConfig?.config_version],
            ].map(([k,v]) => <div key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold break-all">{String(v ?? "—")}</dd></div>)}
          </dl>
        </Panel>
      )}

      {tab === "Prompt/Behavior" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Effective system prompt"><pre className="whitespace-pre-wrap text-xs leading-5">{String(data.aiConfig?.system_prompt ?? "No automation prompt configured.")}</pre></Panel>
          <Panel title="Behavior configuration"><pre className="whitespace-pre-wrap text-xs leading-5">{JSON.stringify(data.aiConfig?.behavior_config ?? {}, null, 2)}</pre></Panel>
          <Panel title="Prompt version history" className="xl:col-span-2">
            <DataTable head={["Key", "Version", "Active", "Created", "Content"]} rows={(data.prompts as Row[]).map((x) => [String(x.prompt_key), String(x.version), x.is_active ? "Yes" : "No", shortDate(String(x.created_at)), <span key="c" className="line-clamp-2 text-xs">{String(x.content)}</span>])} empty="No automation prompt versions." />
          </Panel>
        </div>
      )}

      {tab === "Phone" && (
        <Panel title="Phone / telephony">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted-foreground">Assigned number</dt><dd className="font-semibold">{String(a["assigned_phone_number"] ?? "Not assigned")}</dd>
            <dt className="text-muted-foreground">Twilio status</dt><dd className="font-semibold">{String((data.integrations as Row[]).find((x) => x.provider === "twilio")?.status ?? "Not configured")}</dd>
            <dt className="text-muted-foreground">Calendar status</dt><dd className="font-semibold">{String((data.integrations as Row[]).find((x) => ["google_calendar","google"].includes(x.provider))?.status ?? "Not configured")}</dd>
          </dl>
        </Panel>
      )}

      {tab === "Integrations" && (
        <Panel title="Integration connections">
          <DataTable head={["Provider", "Account", "Status", "Last verified", "Last error"]} rows={(data.integrations as Row[]).map((x) => [String(x.provider), String(x.account_label ?? "—"), String(x.status), x.last_verified_at ? timeAgo(String(x.last_verified_at)) : "—", <span key="e" className="text-xs text-muted-foreground">{String(x.last_error ?? "—")}</span>])} empty="No provider connections." />
        </Panel>
      )}

      {tab === "API Providers" && (
        <Panel title="LLM provider pool" description="Provider metadata only. Secret material and API keys are never rendered here.">
          <DataTable head={["Provider", "Status", "Priority", "Default model", "Base URL"]} rows={(data.providers as Row[]).map((x) => [String(x.display_name), String(x.status), String(x.priority), String(x.default_model ?? "—"), String(x.base_url)])} empty="No providers configured." />
        </Panel>
      )}

      {tab === "LLM Configuration" && (
        <Panel title="LLM request telemetry">
          <DataTable head={["Provider", "Model", "Status", "HTTP", "Latency", "Tokens", "When"]} rows={(data.llm as Row[]).map((x) => [String(x.provider_key), String(x.model), String(x.status), String(x.http_status ?? "—"), x.latency_ms ? `${x.latency_ms}ms` : "—", `${x.tokens_in ?? 0}/${x.tokens_out ?? 0}`, timeAgo(String(x.created_at))])} empty="No LLM requests recorded." />
        </Panel>
      )}

      {tab === "Tasks/Capabilities" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Automation tasks">
            <DataTable head={["Task", "Enabled", "Config"]} rows={(data.tasks as Row[]).map((x) => [String(x.task_key), x.enabled ? "Yes" : "No", <pre key="c" className="max-w-md overflow-auto text-xs">{JSON.stringify(x.config ?? {}, null, 0)}</pre>])} empty="No tasks configured." />
          </Panel>
          <Panel title="Workflow coverage">
            <p className="text-sm text-muted-foreground">{data.workflows.length} workflow definitions and {data.workflowRuns.length} recent execution records are attached to this automation.</p>
            <Link to="/admin/automations/workflow" className="mt-4 inline-block text-xs font-bold text-primary underline">Open Workflow Automation manager</Link>
          </Panel>
        </div>
      )}

      {tab === "Round-Robin" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Round-Robin teams" actions={<Link to="/admin/automations/round-robin" className="text-xs font-bold text-primary underline">Open manager</Link>}>
            <DataTable head={["Team", "Strategy", "Active", "Priority", "Overflow"]} rows={(data.rrTeams as Row[]).map((x) => [String(x.name), String(x.assignment_strategy), x.is_active ? "Yes" : "No", String(x.priority), String(x.overflow_behavior)])} empty="No round-robin teams configured." />
          </Panel>
          <Panel title="Assignment history">
            <DataTable head={["Subject", "Strategy", "Status", "Assigned"]} rows={(data.rrAssignments as Row[]).map((x) => [String(x.subject_type), String(x.strategy), String(x.status), timeAgo(String(x.assigned_at))])} empty="No assignments yet." />
          </Panel>
          <Panel title="Members & rules" className="xl:col-span-2">
            <p className="text-sm text-muted-foreground">{data.rrMembers.length} members and {data.rrRules.length} rules are configured. Availability, priority, weighting and workload limits are persisted in DB4.</p>
          </Panel>
        </div>
      )}

      {tab === "Workflow Automation" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Workflow definitions" actions={<Link to="/admin/automations/workflow" className="text-xs font-bold text-primary underline">Open manager</Link>}>
            <DataTable head={["Name", "Status", "Version", "Trigger", "Updated"]} rows={(data.workflows as Row[]).map((x) => [String(x.name), String(x.status), String(x.version), String(x.trigger_type), timeAgo(String(x.updated_at))])} empty="No workflows for this automation." />
          </Panel>
          <Panel title="Execution history">
            <DataTable head={["Workflow", "Status", "Step", "Attempts", "Queued"]} rows={(data.workflowRuns as Row[]).map((x) => [String(x.workflow_id).slice(0,8), String(x.status), String(x.current_step_order), String(x.attempt_count), timeAgo(String(x.queued_at))])} empty="No workflow runs recorded." />
          </Panel>
        </div>
      )}

      {tab === "Health" && (
        <div className="space-y-6">
          <Panel title="Current check state" description="Real probes only — database, widget endpoint, AI errors, installation, activity, website, knowledge, expiry, providers.">
            <DataTable
              head={["Check", "Status", "Latency", "Error", "Checked"]}
              rows={(data.healthState as Row[]).map((s) => [
                <span key="c" className="font-semibold capitalize">
                  {String(s["check_type"]).replace(/_/g, " ")}
                </span>,
                <span
                  key="s"
                  className={cn(
                    "font-semibold uppercase",
                    s["status"] === "ok" ? "text-success" : s["status"] === "fail" ? "text-destructive" : "text-foreground",
                  )}
                >
                  {String(s["status"])}
                </span>,
                s["latency_ms"] ? `${Number(s["latency_ms"])}ms` : "—",
                <span key="e" className="text-xs text-muted-foreground">
                  {String(s["error"] ?? "—")}
                </span>,
                s["checked_at"] ? timeAgo(String(s["checked_at"])) : "—",
              ])}
              empty="No checks have run yet — use Run diagnostics above."
            />
          </Panel>
          <Panel title="Check history">
            <DataTable
              head={["Check", "Status", "Latency", "When"]}
              rows={(data.checks as Row[]).map((s) => [
                String(s["check_type"]),
                String(s["status"]),
                s["latency_ms"] ? `${Number(s["latency_ms"])}ms` : "—",
                timeAgo(String(s["checked_at"])),
              ])}
              empty="No history yet."
            />
          </Panel>
        </div>
      )}

      {tab === "Widget" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Panel
            title="Widget manager"
            description="Metal Balls configuration stored on this automation and consumed by the production widget runtime."
            actions={
              <Button size="sm" disabled={!!busy} onClick={() => void saveWidget()}>
                {busy === "widget" ? "Saving…" : "Save configuration"}
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-4">
              {color("primary")}
              {color("secondary")}
              {color("center")}
              {color("glow")}
              {num("size", 44, 132, 1)}
              {num("ballCount", 8, 128, 1)}
              {num("radius", 8, 60, 1)}
              {num("ballSize", 1, 12, 1)}
              {num("centerSize", 3, 70, 1)}
              {num("tilt", 0, 180, 1)}
              {num("variation", 0, 1, 0.01)}
              {num("speed", 0.1, 4, 0.1)}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                widget title
                <Input value={config.chat.title} onChange={(e) => setCfg({ ...config, chat: { ...config.chat, title: e.target.value } })} className="mt-1" />
              </label>
              <label className="block text-xs font-semibold text-muted-foreground">
                widget subtitle
                <Input value={config.chat.subtitle} onChange={(e) => setCfg({ ...config, chat: { ...config.chat, subtitle: e.target.value } })} className="mt-1" />
              </label>
              <label className="block text-xs font-semibold text-muted-foreground">
                welcome message
                <Input value={config.welcome} onChange={(e) => setCfg({ ...config, welcome: e.target.value })} className="mt-1" />
              </label>
              <label className="block text-xs font-semibold text-muted-foreground">
                input placeholder
                <Input value={config.placeholder} onChange={(e) => setCfg({ ...config, placeholder: e.target.value })} className="mt-1" />
              </label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                position
                <select
                  value={config.position}
                  onChange={(e) => setCfg({ ...config, position: e.target.value as WidgetCfg["position"] })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button size="sm" variant={config.chat.autoOpen ? "default" : "outline"} onClick={() => setCfg({ ...config, chat: { ...config.chat, autoOpen: !config.chat.autoOpen } })}>
                  auto-open {config.chat.autoOpen ? "on" : "off"}
                </Button>
                <Button size="sm" variant={config.sound ? "default" : "outline"} onClick={() => setCfg({ ...config, sound: !config.sound })}>
                  sound {config.sound ? "on" : "off"}
                </Button>
                <Button size="sm" variant={config.mobile.hidden ? "default" : "outline"} onClick={() => setCfg({ ...config, mobile: { ...config.mobile, hidden: !config.mobile.hidden } })}>
                  mobile {config.mobile.hidden ? "hidden" : "visible"}
                </Button>
                <Button size="sm" variant={config.shine ? "default" : "outline"} onClick={() => setCfg({ ...config, shine: !config.shine })}>
                  shine {config.shine ? "on" : "off"}
                </Button>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-semibold text-muted-foreground">State labels</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {WIDGET_STATE_KEYS.slice(0, 6).map((state) => (
                  <label key={state} className="block text-xs font-semibold text-muted-foreground">
                    {state}
                    <Input value={config.labels[state] ?? state} onChange={(e) => setCfg({ ...config, labels: { ...config.labels, [state]: e.target.value } })} className="mt-1" />
                  </label>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Live preview">
            <MetalBallsPreview c={config} />
            <div className="mt-4 rounded-xl border border-border p-3 text-xs text-muted-foreground">
              <div>Desktop: {config.desktop.size}px</div>
              <div>Mobile: {config.mobile.hidden ? "hidden" : `${config.mobile.size}px`}</div>
              <div className="mt-1">Fallback: {config.fallback.enabled ? config.fallback.type : "disabled"}</div>
            </div>
          </Panel>
        </div>
      )}

      {tab === "Knowledge" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Knowledge documents">
            <DataTable
              head={["Source", "Name", "Priority", "Added"]}
              rows={(data.knowledge as Row[]).map((k) => [
                String(k["source_type"]),
                String(k["source_name"] ?? "—"),
                String(k["priority"] ?? "—"),
                shortDate(String(k["created_at"])),
              ])}
              empty="No documents indexed."
            />
          </Panel>
          <Panel title="Crawl jobs">
            <DataTable
              head={["URL", "Status", "Pages", "Started"]}
              rows={(data.crawls as Row[]).map((c) => [
                <span key="u" className="truncate">
                  {String(c["root_url"] ?? c["url"] ?? "—")}
                </span>,
                String(c["status"]),
                String(c["pages_crawled"] ?? 0),
                shortDate(String(c["created_at"])),
              ])}
              empty="No crawls run."
            />
          </Panel>
        </div>
      )}

      {tab === "Channels" && (
        <Panel title="Channels & integrations" description="A channel is only live when its provider credentials are connected.">
          <DataTable
            head={["Provider", "Status", "Updated"]}
            rows={(data.integrations as Row[]).map((i) => [
              <span key="p" className="font-semibold capitalize">
                {String(i["provider"])}
              </span>,
              <span key="s" className={i["status"] === "connected" ? "text-success" : "text-muted-foreground"}>
                {i["status"] === "connected" ? "Connected" : "Pending provider credentials"}
              </span>,
              i["updated_at"] ? timeAgo(String(i["updated_at"])) : "—",
            ])}
            empty="No integrations connected — this automation answers on the website channel only."
          />
        </Panel>
      )}

      {tab === "Conversations" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Conversations">
            <DataTable
              head={["Channel", "Customer", "Status", "Last message", ""]}
              rows={(data.conversations as Row[]).map((c) => [
                <span key="c" className="capitalize">
                  {String(c["channel"])}
                </span>,
                <span key="x" className="truncate text-xs">
                  {String(c["customer_phone_or_id"] ?? c["origin"] ?? "visitor")}
                </span>,
                <span key="s" className="capitalize">
                  {String(c["status"])}
                </span>,
                c["last_message_at"] ? timeAgo(String(c["last_message_at"])) : "—",
                <Button key="o" size="sm" variant="outline" onClick={() => setOpenConv(String(c["id"]))}>
                  Open
                </Button>,
              ])}
              empty="No conversations yet."
            />
          </Panel>
          <Panel title={openConv ? "Transcript" : "Leads captured"}>
            {openConv ? (
              <div className="space-y-2">
                {(msgs?.messages ?? []).map((m: Row) => (
                  <div
                    key={String(m["id"])}
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                      m["role"] === "user" ? "bg-secondary" : "ml-auto bg-primary text-primary-foreground",
                    )}
                  >
                    {String(m["content"])}
                  </div>
                ))}
                {!msgs?.messages.length && <p className="text-sm text-muted-foreground">No messages.</p>}
                <Button size="sm" variant="outline" onClick={() => setOpenConv(null)}>
                  Close
                </Button>
              </div>
            ) : (
              <DataTable
                head={["Channel", "Lead data", "When"]}
                rows={(data.leads as Row[]).map((l) => [
                  String(l["channel"]),
                  <span key="d" className="text-xs">
                    {JSON.stringify(l["extracted_lead_data"])}
                  </span>,
                  timeAgo(String(l["last_message_at"] ?? l["created_at"])),
                ])}
                empty="No leads captured yet."
              />
            )}
          </Panel>
        </div>
      )}

      {tab === "Logs" && (
        <Panel title="AI provider requests" description="Every routed model call with provider, latency and errors.">
          <DataTable
            head={["Provider", "Model", "Status", "Latency", "Tokens", "Error", "When"]}
            rows={(data.llm as Row[]).map((l) => [
              String(l["provider"]),
              String(l["model"]),
              <span key="s" className={l["status"] === "error" ? "text-destructive" : "text-success"}>
                {String(l["status"])}
                {l["http_status"] ? ` ${String(l["http_status"])}` : ""}
              </span>,
              l["latency_ms"] ? `${Number(l["latency_ms"])}ms` : "—",
              `${Number(l["tokens_in"] ?? 0)}/${Number(l["tokens_out"] ?? 0)}`,
              <span key="e" className="text-xs text-muted-foreground">
                {String(l["error"] ?? "—")}
              </span>,
              timeAgo(String(l["created_at"])),
            ])}
            empty="No AI calls recorded."
          />
        </Panel>
      )}

      {tab === "Leads" && (
        <Panel title="Captured leads">
          <DataTable head={["Channel", "Lead data", "When"]} rows={(data.leads as Row[]).map((l) => [String(l["channel"]), <span key="d" className="text-xs">{JSON.stringify(l["extracted_lead_data"])}</span>, timeAgo(String(l["last_message_at"] ?? l["created_at"]))])} empty="No leads captured yet." />
        </Panel>
      )}

      {tab === "Diagnostics" && (
        <div className="space-y-6">
          <Panel title="Conversation diagnostics">
            <DataTable head={["Severity", "What went wrong", "Recommended fix", "Created"]} rows={(data.diagnostics as Row[]).map((x) => [String(x.severity), <span key="w" className="text-xs">{String(x.what_went_wrong)}</span>, <span key="r" className="text-xs">{String(x.recommended_fix)}</span>, timeAgo(String(x.created_at))])} empty="No conversation diagnostics." />
          </Panel>
          <Panel title="Health check failures">
            <DataTable head={["Check", "Status", "Error", "Checked"]} rows={(data.checks as Row[]).filter((x) => x.status === "fail" || x.status === "warn").slice(0,50).map((x) => [String(x.check_type), String(x.status), String(x.error ?? "—"), timeAgo(String(x.checked_at))])} empty="No warnings or failures in the latest history." />
          </Panel>
        </div>
      )}

      {tab === "Security" && (
        <Panel title="Security & credential posture" description="Sensitive values remain server-side; only non-secret state is shown here.">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Token hash stored", a["script_token_hash"] ? "Yes" : "Protected/hidden"],
              ["Token hint", `…${String(a["token_hint"] ?? "")}`],
              ["HMAC secret", a["hmac_set"] ? "Encrypted and set" : "Not configured"],
              ["HMAC key version", a["hmac_key_version"]],
              ["Reinstallation required", a["requires_reinstallation"] ? "Yes" : "No"],
              ["Active installation count", (data.installations as Row[]).filter((x) => x.status === "active").length],
            ].map(([k,v]) => <div key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold">{String(v ?? "—")}</dd></div>)}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">Privileged mutations are server-authorized, tenant-scoped and audited. Raw provider keys, widget tokens and webhook secrets are not displayed.</p>
        </Panel>
      )}

      {tab === "Audit" && (
        <Panel title="Audit trail">
          <DataTable
            head={["Event", "Actor", "Changes", "When"]}
            rows={(data.audit as Row[]).map((x) => [
              <span key="e" className="font-semibold">
                {String(x["event_type"])}
              </span>,
              <span key="a" className="font-mono text-xs">
                {String(x["actor"] ?? "system")}
              </span>,
              <span key="c" className="text-xs text-muted-foreground">
                {x["changed_fields"] ? JSON.stringify(x["changed_fields"]) : "—"}
              </span>,
              timeAgo(String(x["created_at"])),
            ])}
            empty="No audit entries."
          />
        </Panel>
      )}
    </AdminPage>
  );
}
