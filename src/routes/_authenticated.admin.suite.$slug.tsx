import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminPage, Panel, Loading } from "@/components/admin-ui";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PoolCard } from "@/components/key-pool-card";
import { AUTOMATION_SUITE, automationBySlug } from "@/lib/automation-suite";
import { scopeGroup } from "@/lib/integration-keys";
import { adminListIntegrationKeys } from "@/lib/integration-keys.functions";
import { adminGetSuiteServices, adminSetSuiteService } from "@/lib/suite-services.functions";
import { listAutomations, testAutomation } from "@/lib/command-center.functions";
import { TrainingPanel } from "@/components/training-panel";
import { StatusPill } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const TYPES: Record<string, string[]> = {
  ai_receptionist: ["ai_receptionist"],
  workflow_automation: ["kb_support", "workflow", "workflow_automation"],
  ai_sales_agent: ["lead_capture", "ai_sales_agent"],
  message_ai: ["messaging_ai", "message_ai"],
};

export const Route = createFileRoute("/_authenticated/admin/suite/$slug")({
  loader: ({ params }) => {
    const def = automationBySlug(params.slug);
    if (!def) throw notFound();
    return { title: def.title };
  },
  head: ({ loaderData }) => ({
    meta: [
      { property: "og:title", content: "Admin Suite Slug — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Admin Suite Slug in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: `${loaderData?.title ?? "Automation"} — Manage | AntheticPlus` },
      { name: "description", content: "Services, key rotation and setup for this automation." },
    ],
  }),
  component: SuitePage,
});

const NEED_LABEL: Record<string, string> = {
  twilio: "Twilio",
  calendar: "Calendar",
  payments: "Payments",
};

function SuitePage() {
  const { slug } = Route.useParams();
  const def = automationBySlug(slug)!;
  const qc = useQueryClient();
  const getServices = useServerFn(adminGetSuiteServices);
  const setService = useServerFn(adminSetSuiteService);
  const listKeys = useServerFn(adminListIntegrationKeys);
  const services = useQuery({
    queryKey: ["suite-services", slug],
    queryFn: () => getServices({ data: { slug } }),
  });
  const keys = useQuery({ queryKey: ["integration-keys"], queryFn: () => listKeys() });
  const pools = scopeGroup(def.scope)?.pools ?? [];
  const scopeKeys =
    keys.data && !keys.data.notConfigured ? (keys.data.byScope[def.scope] ?? []) : [];

  async function toggle(serviceId: string, enabled: boolean) {
    try {
      await setService({ data: { slug, serviceId, enabled } });
      void qc.invalidateQueries({ queryKey: ["suite-services", slug] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AdminPage title={def.title} subtitle={def.tagline}>
      <nav className="mb-4 flex flex-wrap gap-2">
        {AUTOMATION_SUITE.map((a) => (
          <Link
            key={a.slug}
            to="/admin/suite/$slug"
            params={{ slug: a.slug }}
            className={`rounded-full border px-3 py-1 text-sm ${a.slug === slug ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {a.title}
          </Link>
        ))}
      </nav>
      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>
        <TabsContent value="services">
          <Panel
            title={`${def.services.length} services`}
            description="Switched-on services run for every client automatically. Clients do no setup."
          >
            {services.isLoading ? (
              <Loading label="Loading services…" />
            ) : (
              <>
                {services.data && !services.data.ok && (
                  <p className="mb-3 text-sm text-destructive">
                    Can't save yet: {services.data.message}
                  </p>
                )}
                <ul className="divide-y">
                  {def.services.map((s) => (
                    <li key={s.id} className="flex items-start gap-4 py-3">
                      <div className="flex-1">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-sm text-muted-foreground">{s.summary}</div>
                        {s.needs?.length ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Uses: {s.needs.map((n) => NEED_LABEL[n]).join(", ")} (only for clients
                            who turned it on)
                          </div>
                        ) : null}
                      </div>
                      <Switch
                        aria-label={s.title}
                        checked={services.data?.switches[s.id] ?? true}
                        onCheckedChange={(v) => void toggle(s.id, v)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="keys" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This automation has its own key rotation. When one key hits a limit the next takes over
            instantly and the conversation continues.
          </p>
          {keys.isLoading ? (
            <Loading label="Loading keys…" />
          ) : keys.data?.notConfigured ? (
            <p className="text-sm text-destructive">{keys.data.message}</p>
          ) : (
            pools.map((p) => (
              <PoolCard
                key={p.provider}
                scope={def.scope}
                pool={p}
                keys={scopeKeys.filter((k) => k.provider === p.provider)}
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="integrations">
          <Panel
            title="Integrations"
            description="What this automation uses, and whether keys are ready."
          >
            <ul className="divide-y">
              {pools.map((p) => {
                const n = scopeKeys.filter((k) => k.provider === p.provider && k.enabled).length;
                return (
                  <li key={p.provider} className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {n} of {p.maxKeys} keys active
                      </div>
                    </div>
                    <StatusPill status={n ? "ready" : "missing"} />
                  </li>
                );
              })}
              {[...new Set(def.services.flatMap((s) => s.needs ?? []))].map((n) => (
                <li key={n} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <div className="font-medium">{NEED_LABEL[n]}</div>
                    <div className="text-xs text-muted-foreground">
                      Connected per client when they choose it while ordering, or on request.
                    </div>
                  </div>
                  <StatusPill status="per client" />
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>
        <TabsContent value="test">
          <TestTab types={TYPES[def.scope] ?? []} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab types={TYPES[def.scope] ?? []} />
        </TabsContent>
        <TabsContent value="training">
          <TrainingPanel types={TYPES[def.scope] ?? []} showSites={false} />
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function useLive(types: string[]) {
  const list = useServerFn(listAutomations);
  const q = useQuery({ queryKey: ["cc-automations"], queryFn: () => list() });
  return { ...q, rows: (q.data?.automations ?? []).filter((a) => types.includes(a.type)) };
}

function TestTab({ types }: { types: string[] }) {
  const { rows, isLoading } = useLive(types);
  const test = useServerFn(testAutomation);
  const [id, setId] = useState("");
  const [msg, setMsg] = useState("Hi, what can you help me with?");
  const [out, setOut] = useState<{ reply: string; latencyMs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    setOut(null);
    try {
      const r = await test({ data: { id, message: msg } });
      setOut({ reply: r.reply, latencyMs: r.latencyMs });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (isLoading) return <Loading label="Loading automations…" />;
  return (
    <Panel
      title="Send a test message"
      description="Talks to a real client automation with its own knowledge and keys."
    >
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">No live automations of this kind yet.</p>
      ) : (
        <div className="space-y-3">
          <select
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="">Choose a client automation…</option>
            {rows.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company || a.clientName || a.clientId} · {a.domain}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} />
            <Button disabled={!id || !msg.trim() || busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
          {out && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">Reply in {out.latencyMs} ms</div>
              <p className="whitespace-pre-wrap">{out.reply}</p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ActivityTab({ types }: { types: string[] }) {
  const { rows, isLoading } = useLive(types);
  if (isLoading) return <Loading label="Loading activity…" />;
  return (
    <Panel
      title={`${rows.length} client automations`}
      description="Health, usage and last activity for each client."
    >
      <ul className="divide-y">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-56 flex-1">
              <Link
                to="/admin/automations/$id"
                params={{ id: a.id }}
                className="font-medium hover:underline"
              >
                {a.company || a.clientName || a.clientId}
              </Link>
              <div className="text-xs text-muted-foreground">
                {a.domain} · {a.tokens.toLocaleString()} tokens this month · last active{" "}
                {a.lastActivity ? new Date(a.lastActivity).toLocaleString() : "never"}
                {a.providerFailures ? ` · ${a.providerFailures} AI errors today` : ""}
              </div>
            </div>
            <StatusPill status={a.isActive ? a.health.toLowerCase() : "paused"} />
          </li>
        ))}
        {!rows.length && <li className="py-3 text-sm text-muted-foreground">No activity yet.</li>}
      </ul>
    </Panel>
  );
}
