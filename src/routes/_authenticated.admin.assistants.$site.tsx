import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AdminPage,
  AreaField,
  Field,
  Loading,
  Panel,
  StatusPill,
  TextField,
  timeAgo,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SITES, SITE_TOOL_CATALOG, isSiteId, type SiteId } from "@/assistant/sites/site-registry";
import {
  STALE_AFTER_HOURS,
  type KnowledgeItem,
  type SiteConfig,
} from "@/assistant/sites/site-config.types";
import {
  adminAddSource,
  adminDeleteKnowledge,
  adminGetSiteConfig,
  adminPreviewSiteAssistant,
  adminSaveSiteSettings,
  adminScanSource,
  adminUpdateSource,
  adminUpsertKnowledge,
} from "@/lib/web-assistant-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/assistants/$site")({
  beforeLoad: ({ params }) => {
    if (!isSiteId(params.site)) throw notFound();
  },
  head: () => ({ meta: [{ title: "Site Assistant — AntheticPlus Control Center" }] }),
  component: SiteAssistantPage,
});

const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "The server did not confirm the change.";

function SiteAssistantPage() {
  const { site } = Route.useParams();
  const id: SiteId = isSiteId(site) ? site : "antheticplus";
  const get = useServerFn(adminGetSiteConfig);
  const qc = useQueryClient();
  const key = ["web-assistant", id];
  const q = useQuery({ queryKey: key, queryFn: () => get({ data: { siteId: id } }) });
  const setConfig = (config: SiteConfig) => qc.setQueryData(key, { siteId: id, config });
  const c = q.data?.config;

  return (
    <AdminPage
      title={`${SITES[id].name} Assistant`}
      subtitle={`Editing the ${SITES[id].name} site only. Changes never affect the other site; both run on the same shared assistant engine.`}
    >
      <Link to="/admin/assistants" className="text-sm text-primary hover:underline">
        ← All assistants
      </Link>
      {q.isLoading ? (
        <Loading />
      ) : q.error || !c ? (
        <Panel>
          <p className="text-sm text-destructive">Couldn't load settings: {errMsg(q.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </Panel>
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            {[
              "overview",
              "persona",
              "business",
              "services",
              "knowledge",
              "sources",
              "discovery",
              "tools",
              "voice",
              "analytics",
              "test",
            ].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {(
                  {
                    persona: "Persona & Tone",
                    business: "Business Context",
                    sources: "Knowledge Sources",
                    discovery: "Automatic Discovery",
                    tools: "Tools & Permissions",
                    test: "Test Chat",
                  } as Record<string, string>
                )[t] ?? t}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">
            <Overview id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="persona">
            <SettingsForm
              id={id}
              c={c}
              onSaved={setConfig}
              title="Persona & Tone"
              fields={[
                ["displayName", "Assistant name", false],
                ["persona", "Persona", true],
                ["tone", "Tone", false],
                ["welcomeMessage", "Welcome message", true],
                ["instructions", "System instructions", true],
              ]}
            />
          </TabsContent>
          <TabsContent value="business">
            <SettingsForm
              id={id}
              c={c}
              onSaved={setConfig}
              title="Business Context"
              fields={[
                ["businessInfo", "Business information", true],
                ["contact", "Contact details", true],
                ["hours", "Hours", true],
                ["policies", "Policies", true],
                ["terminology", "Terminology", true],
              ]}
            />
          </TabsContent>
          <TabsContent value="services">
            <SettingsForm
              id={id}
              c={c}
              onSaved={setConfig}
              title="Services, Products & FAQs"
              fields={[
                ["services", "Services", true],
                ["products", "Products", true],
                ["faqs", "FAQs", true],
              ]}
            />
          </TabsContent>
          <TabsContent value="knowledge">
            <KnowledgeTab id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="sources">
            <SourcesTab id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="discovery">
            <DiscoveryTab id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="tools">
            <ToolsTab id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="voice">
            <VoiceTab id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab id={id} c={c} onSaved={setConfig} />
          </TabsContent>
          <TabsContent value="test">
            <TestChat id={id} />
          </TabsContent>
        </Tabs>
      )}
    </AdminPage>
  );
}

type TabProps = { id: SiteId; c: SiteConfig; onSaved: (c: SiteConfig) => void };

/** Saves a partial settings patch; only reports success after the server returns the persisted config. */
function useSave({ id, onSaved }: Pick<TabProps, "id" | "onSaved">) {
  const save = useServerFn(adminSaveSiteSettings);
  const [busy, setBusy] = useState(false);
  const run = async (patch: Partial<SiteConfig>) => {
    setBusy(true);
    try {
      const r = await save({ data: { siteId: id, config: patch as Record<string, unknown> } });
      if (!r?.ok) throw new Error("Save was not confirmed.");
      onSaved(r.config);
      toast.success(`Saved to ${SITES[id].name}`);
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Overview({ id, c, onSaved }: TabProps) {
  const { run, busy } = useSave({ id, onSaved });
  const approved = c.knowledge.filter((k) => k.status === "approved").length;
  const review = c.knowledge.filter((k) => k.status === "needs_review").length;
  return (
    <Panel title="Overview" description={`Scope: ${SITES[id].name} only`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Assistant enabled">
          <Switch
            disabled={busy}
            checked={c.enabled}
            onCheckedChange={(v) => void run({ enabled: v })}
          />
        </Row>
        <Row label="Voice enabled">
          <Switch
            disabled={busy}
            checked={c.voiceEnabled}
            onCheckedChange={(v) => void run({ voiceEnabled: v })}
          />
        </Row>
        <Row label="Knowledge (approved / needs review)">
          <span className="text-sm">
            {approved} / {review}
          </span>
        </Row>
        <Row label="Knowledge sources">
          <span className="text-sm">{c.sources.length}</span>
        </Row>
        <Row label="Allowed tools">
          <span className="text-right text-sm">{c.allowedTools.length}</span>
        </Row>
        <Row label="Domains">
          <span className="text-right text-sm">
            {[...SITES[id].domains, ...c.extraDomains].join(", ") || "This app's own domain"}
          </span>
        </Row>
      </div>
      <div className="mt-4 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
        Embed:{" "}
        <code>{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/assistant.js" data-site-id="${id}"></script>`}</code>
      </div>
    </Panel>
  );
}

function SettingsForm({
  id,
  c,
  onSaved,
  title,
  fields,
}: TabProps & { title: string; fields: Array<[keyof SiteConfig, string, boolean]> }) {
  const { run, busy } = useSave({ id, onSaved });
  const init = () => Object.fromEntries(fields.map(([k]) => [k, String(c[k] ?? "")]));
  const [v, setV] = useState<Record<string, string>>(init);
  useEffect(() => setV(init()), [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = fields.some(([k]) => v[k] !== String(c[k] ?? ""));
  return (
    <Panel
      title={title}
      description={`Scope: ${SITES[id].name} only. Admin values here outrank anything discovered automatically.`}
    >
      <div className="grid gap-4">
        {fields.map(([k, label, area]) => (
          <Field key={k} label={label}>
            {area ? (
              <AreaField
                rows={4}
                maxLength={4000}
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
              />
            ) : (
              <TextField
                maxLength={160}
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
              />
            )}
          </Field>
        ))}
        <div className="flex gap-2">
          <Button disabled={!dirty || busy} onClick={() => void run(v as Partial<SiteConfig>)}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" disabled={!dirty || busy} onClick={() => setV(init())}>
            Discard
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const CATS: KnowledgeItem["category"][] = [
  "business",
  "service",
  "product",
  "faq",
  "policy",
  "contact",
  "hours",
  "pricing",
  "other",
];
const blankItem = {
  id: null as string | null,
  title: "",
  content: "",
  category: "faq" as KnowledgeItem["category"],
  status: "approved" as KnowledgeItem["status"],
};

function KnowledgeTab({ id, c, onSaved }: TabProps) {
  const upsert = useServerFn(adminUpsertKnowledge);
  const del = useServerFn(adminDeleteKnowledge);
  const [edit, setEdit] = useState<typeof blankItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | KnowledgeItem["status"]>("all");
  const act = async (fn: () => Promise<{ ok: boolean; config: SiteConfig }>, msg: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) throw new Error();
      onSaved(r.config);
      toast.success(msg);
      setEdit(null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const items = c.knowledge.filter((k) => filter === "all" || k.status === filter);
  return (
    <Panel
      title="Knowledge"
      description={`${SITES[id].name} knowledge only. Discovered items that conflict with manual values are flagged for review.`}
      actions={
        <Button size="sm" onClick={() => setEdit({ ...blankItem })}>
          Add item
        </Button>
      }
    >
      {edit && (
        <div className="mb-5 grid gap-3 rounded-xl border border-primary/30 p-4">
          <Field label="Title">
            <TextField
              maxLength={160}
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
          </Field>
          <Field label="Content">
            <AreaField
              rows={5}
              maxLength={4000}
              value={edit.content}
              onChange={(e) => setEdit({ ...edit, content: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={edit.category}
                onChange={(e) =>
                  setEdit({ ...edit, category: e.target.value as KnowledgeItem["category"] })
                }
              >
                {CATS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={edit.status}
                onChange={(e) =>
                  setEdit({ ...edit, status: e.target.value as KnowledgeItem["status"] })
                }
              >
                {["approved", "needs_review", "disabled"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={busy || !edit.title.trim() || !edit.content.trim()}
              onClick={() =>
                void act(() => upsert({ data: { siteId: id, item: edit } }), "Knowledge saved")
              }
            >
              {busy ? "Saving…" : "Save item"}
            </Button>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-1">
        {(["all", "approved", "needs_review", "disabled"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f.replace("_", " ")}
          </Button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No knowledge items here yet.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((k) => (
            <li key={k.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{k.title}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-secondary px-2 py-0.5">{k.kind}</span>
                  <span className="rounded bg-secondary px-2 py-0.5">{k.category}</span>
                  <StatusPill status={k.status} />
                </div>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {k.content}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEdit({
                      id: k.id,
                      title: k.title,
                      content: k.content,
                      category: k.category,
                      status: k.status,
                    })
                  }
                >
                  Edit
                </Button>
                {k.status === "needs_review" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          upsert({
                            data: {
                              siteId: id,
                              item: {
                                id: k.id,
                                title: k.title,
                                content: k.content,
                                category: k.category,
                                status: "approved",
                              },
                            },
                          }),
                        "Approved",
                      )
                    }
                  >
                    Approve
                  </Button>
                )}
                <Confirm
                  label="Delete"
                  title={`Delete "${k.title}"?`}
                  body={`This removes the item from the ${SITES[id].name} assistant only.`}
                  onConfirm={() =>
                    void act(() => del({ data: { siteId: id, id: k.id } }), "Deleted")
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Confirm({
  label,
  title,
  body,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function freshness(last: string | null) {
  if (!last) return "never";
  const h = (Date.now() - new Date(last).getTime()) / 36e5;
  return h > STALE_AFTER_HOURS ? "stale" : "fresh";
}

function SourcesTab({ id, c, onSaved }: TabProps) {
  const add = useServerFn(adminAddSource);
  const upd = useServerFn(adminUpdateSource);
  const scan = useServerFn(adminScanSource);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (
    k: string,
    fn: () => Promise<{
      ok: boolean;
      config: SiteConfig;
      error?: string | null;
      changed?: boolean;
    }>,
    msg: string,
  ) => {
    setBusy(k);
    try {
      const r = await fn();
      onSaved(r.config);
      if (!r.ok) throw new Error(r.error ?? "The operation failed.");
      toast.success(r.changed === false ? "Scanned — no changes found" : msg);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const domains = [...SITES[id].domains, ...c.extraDomains];
  return (
    <Panel
      title="Knowledge Sources"
      description={`Only URLs on ${domains.join(", ") || "this app's domain"} are accepted.`}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <TextField
          placeholder={`https://${domains[0] ?? "example.com"}/about`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          disabled={!url || busy === "add"}
          onClick={() =>
            void run("add", () => add({ data: { siteId: id, url } }), "Source added").then(() =>
              setUrl(""),
            )
          }
        >
          Add source
        </Button>
      </div>
      {c.sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources yet.</p>
      ) : (
        <ul className="grid gap-2">
          {c.sources.map((s) => (
            <li key={s.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-medium text-primary hover:underline"
                >
                  {s.url}
                </a>
                <div className="flex gap-2">
                  <StatusPill status={s.active ? s.status : "disabled"} />
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs">
                    {freshness(s.lastSuccessAt)}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Last scan {timeAgo(s.lastScanAt)} · last success {timeAgo(s.lastSuccessAt)} · last
                change {timeAgo(s.lastChangeAt)} · {s.itemCount} items
              </p>
              {s.error && <p className="mt-1 text-xs text-destructive">{s.error}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy || !s.active}
                  onClick={() =>
                    void run(s.id, () => scan({ data: { siteId: id, id: s.id } }), "Scan complete")
                  }
                >
                  {busy === s.id ? "Scanning…" : "Rescan"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
                      s.id + "t",
                      () =>
                        upd({
                          data: { siteId: id, id: s.id, op: s.active ? "disable" : "enable" },
                        }),
                      s.active ? "Disabled" : "Enabled",
                    )
                  }
                >
                  {s.active ? "Disable" : "Enable"}
                </Button>
                <Confirm
                  label="Remove"
                  title="Remove this source?"
                  body={`Removes the source and every item discovered from it on ${SITES[id].name}. Manual knowledge is not affected.`}
                  onConfirm={() =>
                    void run(
                      s.id + "r",
                      () => upd({ data: { siteId: id, id: s.id, op: "remove" } }),
                      "Removed",
                    )
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DiscoveryTab({ id, c, onSaved }: TabProps) {
  const { run, busy } = useSave({ id, onSaved });
  const [hours, setHours] = useState(String(c.discovery.refreshHours));
  const discovered = c.knowledge.filter((k) => k.kind === "discovered");
  const conflicts = discovered.filter((k) => k.status === "needs_review");
  const [extra, setExtra] = useState(c.extraDomains.join(", "));
  return (
    <Panel
      title="Automatic Discovery"
      description="Discovered facts never override admin-entered values; conflicts wait for review."
    >
      <div className="grid gap-3">
        <Row label="Discovery enabled">
          <Switch
            disabled={busy}
            checked={c.discovery.enabled}
            onCheckedChange={(v) => void run({ discovery: { ...c.discovery, enabled: v } })}
          />
        </Row>
        <Field label="Refresh interval (hours)">
          <div className="flex gap-2">
            <TextField
              type="number"
              min={1}
              max={720}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <Button
              disabled={busy}
              onClick={() =>
                void run({
                  discovery: {
                    ...c.discovery,
                    refreshHours: Math.min(720, Math.max(1, Number(hours) || 24)),
                  },
                })
              }
            >
              Save
            </Button>
          </div>
        </Field>
        <Field
          label="Extra approved domains"
          hint="Comma-separated. Only these and the built-in domains can be crawled or embed the widget."
        >
          <div className="flex gap-2">
            <TextField value={extra} onChange={(e) => setExtra(e.target.value)} />
            <Button
              disabled={busy}
              onClick={() =>
                void run({
                  extraDomains: extra
                    .split(",")
                    .map((d) => d.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
            >
              Save
            </Button>
          </div>
        </Field>
        <p className="text-sm">
          {discovered.length} discovered items ·{" "}
          <span className={conflicts.length ? "text-destructive" : ""}>
            {conflicts.length} need review
          </span>{" "}
          (review them in the Knowledge tab).
        </p>
      </div>
    </Panel>
  );
}

function ToolsTab({ id, c, onSaved }: TabProps) {
  const { run, busy } = useSave({ id, onSaved });
  const firstParty = SITES[id].firstParty;
  const toggle = (name: string, on: boolean) =>
    void run({
      allowedTools: on
        ? [...new Set([...c.allowedTools, name])]
        : c.allowedTools.filter((t) => t !== name),
    });
  return (
    <Panel
      title="Tools & Permissions"
      description="Allowing a tool here is only the first gate — every tool still checks sign-in, role and ownership on the server."
    >
      <div className="grid gap-2">
        {SITE_TOOL_CATALOG.map((t) => {
          const locked = t.firstPartyOnly && !firstParty;
          return (
            <Row key={t.name} label={`${t.label}${locked ? " (not available on this site)" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {t.description}
                </span>
                <Switch
                  disabled={busy || locked}
                  checked={!locked && c.allowedTools.includes(t.name)}
                  onCheckedChange={(v) => toggle(t.name, v)}
                />
              </div>
            </Row>
          );
        })}
        <Row
          label={`Email sending${firstParty ? " (always requires user confirmation)" : " (not available on this site)"}`}
        >
          <Switch
            disabled={busy || !firstParty}
            checked={firstParty && c.emailEnabled}
            onCheckedChange={(v) => void run({ emailEnabled: v })}
          />
        </Row>
      </div>
    </Panel>
  );
}

function VoiceTab({ id, c, onSaved }: TabProps) {
  const { run, busy } = useSave({ id, onSaved });
  const [v, setV] = useState({ ...c.voice });
  const [b, setB] = useState({ ...c.branding });
  return (
    <Panel
      title="Voice & Branding"
      description="Uses the visitor's browser speech. Visitors without microphone or speech support fall back to typing."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Language">
          <TextField
            value={v.lang}
            maxLength={12}
            onChange={(e) => setV({ ...v, lang: e.target.value })}
          />
        </Field>
        <Field label={`Rate (${v.rate})`}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={v.rate}
            onChange={(e) => setV({ ...v, rate: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Pitch (${v.pitch})`}>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={v.pitch}
            onChange={(e) => setV({ ...v, pitch: Number(e.target.value) })}
          />
        </Field>
        <Field label="Primary colour">
          <input
            type="color"
            value={b.primary}
            onChange={(e) => setB({ ...b, primary: e.target.value })}
          />
        </Field>
        <Field label="Accent colour">
          <input
            type="color"
            value={b.accent}
            onChange={(e) => setB({ ...b, accent: e.target.value })}
          />
        </Field>
        <Field label="Position">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={b.position}
            onChange={(e) => setB({ ...b, position: e.target.value as "left" | "right" })}
          >
            <option>right</option>
            <option>left</option>
          </select>
        </Field>
      </div>
      <Button className="mt-4" disabled={busy} onClick={() => void run({ voice: v, branding: b })}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </Panel>
  );
}

function AnalyticsTab({ id, c, onSaved }: TabProps) {
  const { run, busy } = useSave({ id, onSaved });
  const [lim, setLim] = useState({ ...c.limits });
  return (
    <Panel title="Analytics & Limits" description={`Scope: ${SITES[id].name}`}>
      <div className="grid gap-3">
        <Row label="Collect analytics for this site">
          <Switch
            disabled={busy}
            checked={c.analyticsEnabled}
            onCheckedChange={(v) => void run({ analyticsEnabled: v })}
          />
        </Row>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Max message length">
            <TextField
              type="number"
              min={100}
              max={1200}
              value={lim.maxMessageChars}
              onChange={(e) => setLim({ ...lim, maxMessageChars: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max turns per conversation">
            <TextField
              type="number"
              min={1}
              max={100}
              value={lim.maxTurnsPerConversation}
              onChange={(e) => setLim({ ...lim, maxTurnsPerConversation: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Button
          className="w-fit"
          disabled={busy}
          onClick={() =>
            void run({
              limits: {
                maxMessageChars: Math.min(1200, Math.max(100, lim.maxMessageChars)),
                maxTurnsPerConversation: Math.min(100, Math.max(1, lim.maxTurnsPerConversation)),
              },
            })
          }
        >
          Save limits
        </Button>
        <p className="text-xs text-muted-foreground">
          Conversation volume reporting for this site appears under Admin → Analytics.
        </p>
      </div>
    </Panel>
  );
}

function TestChat({ id }: { id: SiteId }) {
  const preview = useServerFn(adminPreviewSiteAssistant);
  const [msgs, setMsgs] = useState<
    Array<{ role: "user" | "assistant"; content: string; error?: boolean }>
  >([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const message = text.trim();
    if (!message) return;
    const history = msgs.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await preview({ data: { siteId: id, message, history } });
      setMsgs((m) => [
        ...m,
        r.ok
          ? { role: "assistant", content: r.reply }
          : {
              role: "assistant",
              content:
                r.error.code === "ai_unavailable"
                  ? `${r.error.message} Configure one under Admin → AI Infrastructure → LLM Providers.`
                  : r.error.message,
              error: true,
            },
      ]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: errMsg(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Test Chat"
      description={`Talks to the shared engine as a signed-out ${SITES[id].name} visitor.`}
      actions={
        <Button size="sm" variant="outline" onClick={() => setMsgs([])}>
          Clear
        </Button>
      }
    >
      <div className="mb-3 grid max-h-96 gap-2 overflow-y-auto">
        {msgs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask something a {SITES[id].name} visitor might ask.
          </p>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : m.error ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}
          >
            {m.content}
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <TextField
          maxLength={1200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a test message"
        />
        <Button disabled={busy || !text.trim()}>Send</Button>
      </form>
    </Panel>
  );
}
