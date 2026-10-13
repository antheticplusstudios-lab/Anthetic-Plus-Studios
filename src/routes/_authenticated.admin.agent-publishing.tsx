import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Globe2, History, Rocket, Send, Trash2, XCircle } from "lucide-react";
import {
  AdminPage,
  EmptyState,
  Loading,
  Panel,
  StatusPill,
  shortDate,
  timeAgo,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SITES, SITE_IDS, type SiteId } from "@/assistant/sites/site-registry";
import { VERIFY_FILE_PATH, VERIFY_TXT_PREFIX } from "@/assistant/sites/site-publishing";
import {
  adminAddDomain,
  adminCheckDomain,
  adminDiscardDraft,
  adminGetAgent,
  adminPublishAgent,
  adminRemoveDomain,
  adminReviewKnowledge,
  adminRollbackAgent,
  adminTestAgent,
} from "@/lib/site-publishing.functions";

export const Route = createFileRoute("/_authenticated/admin/agent-publishing")({
  head: () => ({
    meta: [
      { title: "Website Agent Publishing — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Draft, test, publish and roll back each website's AI agent.",
      },
      { property: "og:title", content: "Website Agent Publishing" },
      {
        property: "og:description",
        content: "Draft, test, publish and roll back website AI agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATE_LABEL = {
  not_configured: "Not configured",
  draft: "Unpublished draft",
  published: "Published",
  failed: "Last publish failed",
} as const;

const errMsg = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

function Page() {
  const [site, setSite] = useState<SiteId>(SITE_IDS[0]);
  return (
    <AdminPage
      title="Website agent: draft & publish"
      subtitle="Edits are saved as a draft. Visitors only see what you publish. Every publish is kept so you can roll back."
    >
      <Tabs value={site} onValueChange={(v) => setSite(v as SiteId)}>
        <TabsList>
          {SITE_IDS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {SITES[id].name}
            </TabsTrigger>
          ))}
        </TabsList>
        {SITE_IDS.map((id) => (
          <TabsContent key={id} value={id} className="mt-6">
            {site === id && <SiteAgent siteId={id} />}
          </TabsContent>
        ))}
      </Tabs>
    </AdminPage>
  );
}

function SiteAgent({ siteId }: { siteId: SiteId }) {
  const qc = useQueryClient();
  const get = useServerFn(adminGetAgent);
  const qk = ["agent", siteId];
  const q = useQuery({ queryKey: qk, queryFn: () => get({ data: { siteId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: qk });
  const publish = useServerFn(adminPublishAgent);
  const discard = useServerFn(adminDiscardDraft);
  const rollback = useServerFn(adminRollbackAgent);
  const [note, setNote] = useState("");

  const pubM = useMutation({
    mutationFn: () => publish({ data: { siteId, note } }),
    onSuccess: (r) => {
      toast.success(`Published v${r.version}`);
      setNote("");
    },
    onError: errMsg,
    onSettled: () => void refresh(),
  });
  const disM = useMutation({
    mutationFn: () => discard({ data: { siteId } }),
    onSuccess: () => void refresh(),
    onError: errMsg,
  });
  const rbM = useMutation({
    mutationFn: (version: number) => rollback({ data: { siteId, version } }),
    onSuccess: (r) => {
      toast.success(`Rolled back — now live as v${r.version}`);
      void refresh();
    },
    onError: errMsg,
  });

  if (q.isLoading) return <Loading label="Loading agent" />;
  if (q.error)
    return <EmptyState title="Couldn't load this agent" description={(q.error as Error).message} />;
  const d = q.data!;

  return (
    <div className="space-y-6">
      <Panel
        title="Status"
        description={`Live settings saved ${d.liveUpdatedAt ? timeAgo(d.liveUpdatedAt) : "never"}${d.draftUpdatedAt ? ` · draft saved ${timeAgo(d.draftUpdatedAt)}` : ""}`}
        actions={<StatusPill status={STATE_LABEL[d.state]} />}
      >
        <div className="space-y-4 text-sm">
          {d.lastError && (
            <p className="text-destructive">Last publish attempt failed: {d.lastError}</p>
          )}
          {d.changed.length > 0 ? (
            <p>
              Draft changes: <span className="text-muted-foreground">{d.changed.join(", ")}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">No unpublished changes.</p>
          )}
          {d.blockers.length > 0 && (
            <ul className="space-y-1">
              {d.blockers.map((b) => (
                <li key={b} className="flex items-center gap-2 text-destructive">
                  <XCircle className="size-4" /> {b}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-sm"
              placeholder="Publish note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              disabled={!d.changed.length || d.blockers.length > 0 || pubM.isPending}
              onClick={() => pubM.mutate()}
            >
              <Rocket className="size-4" /> Publish
            </Button>
            <Button
              variant="outline"
              disabled={!d.changed.length || disM.isPending}
              onClick={() => disM.mutate()}
            >
              Discard draft
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/admin/assistants/$site" params={{ site: siteId }}>
                Edit settings
              </Link>
            </Button>
          </div>
        </div>
      </Panel>

      <TestConsole siteId={siteId} hasDraft={d.changed.length > 0} />
      <Domains
        siteId={siteId}
        domains={d.domains}
        onChange={refresh}
        firstParty={SITES[siteId].firstParty}
      />
      <KnowledgeReview siteId={siteId} items={d.knowledge} onChange={refresh} />

      <Panel
        title="Version history"
        description="Rollback republishes an old version as a new one. Knowledge isn't affected."
      >
        {d.versions.length === 0 ? (
          <EmptyState title="Nothing published yet" description="Your first publish creates v1." />
        ) : (
          <ul className="divide-y divide-border">
            {d.versions.map((v, i) => (
              <li
                key={v.version}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium">v{v.version}</span> · {shortDate(v.publishedAt)}
                  {v.note && <span className="text-muted-foreground"> · {v.note}</span>}
                  {i === 0 && <span className="ml-2 text-xs text-primary">live</span>}
                </span>
                {i > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rbM.isPending}
                    onClick={() => rbM.mutate(v.version)}
                  >
                    <History className="size-4" /> Roll back to v{v.version}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function TestConsole({ siteId, hasDraft }: { siteId: SiteId; hasDraft: boolean }) {
  const test = useServerFn(adminTestAgent);
  const [target, setTarget] = useState<"draft" | "live">(hasDraft ? "draft" : "live");
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const m = useMutation({
    mutationFn: (message: string) =>
      test({ data: { siteId, target, message, history: log.slice(-12) } }),
    onSuccess: (r, message) => {
      const reply = r.ok ? r.reply : `⚠ ${r.error.message}`;
      setLog((l) => [
        ...l,
        { role: "user", content: message },
        { role: "assistant", content: reply },
      ]);
    },
    onError: errMsg,
  });
  return (
    <Panel
      title="Test console"
      description="Talks to the real agent as an anonymous visitor. Uses AI from your own provider keys."
      actions={
        <div className="flex gap-1">
          {(["draft", "live"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={target === t ? "default" : "outline"}
              onClick={() => {
                setTarget(t);
                setLog([]);
              }}
            >
              {t === "draft" ? "Test draft" : "Test live"}
            </Button>
          ))}
        </div>
      }
    >
      <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {log.length === 0 && (
          <p className="text-muted-foreground">Ask something a visitor would ask.</p>
        )}
        {log.map((x, i) => (
          <p key={i} className={x.role === "user" ? "font-medium" : "text-muted-foreground"}>
            {x.role === "user" ? "You: " : "Agent: "}
            {x.content}
          </p>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (msg.trim()) m.mutate(msg.trim());
          setMsg("");
        }}
      >
        <Input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Type a test message"
        />
        <Button type="submit" disabled={m.isPending}>
          <Send className="size-4" />
        </Button>
      </form>
    </Panel>
  );
}

type Dom = {
  domain: string;
  token: string;
  verifiedAt: string | null;
  lastCheckError: string | null;
};
function Domains({
  siteId,
  domains,
  onChange,
  firstParty,
}: {
  siteId: SiteId;
  domains: Dom[];
  onChange: () => void;
  firstParty: boolean;
}) {
  const add = useServerFn(adminAddDomain);
  const check = useServerFn(adminCheckDomain);
  const del = useServerFn(adminRemoveDomain);
  const [domain, setDomain] = useState("");
  const addM = useMutation({
    mutationFn: () => add({ data: { siteId, domain } }),
    onSuccess: () => {
      setDomain("");
      onChange();
    },
    onError: errMsg,
  });
  const chkM = useMutation({
    mutationFn: (d: string) => check({ data: { siteId, domain: d } }),
    onSuccess: (r) => {
      if (r.verifiedAt) toast.success("Domain verified");
      else toast.error(r.lastCheckError ?? "Not verified yet");
      onChange();
    },
    onError: errMsg,
  });
  const delM = useMutation({
    mutationFn: (d: string) => del({ data: { siteId, domain: d } }),
    onSuccess: onChange,
    onError: errMsg,
  });
  return (
    <Panel
      title="Verified domains"
      description={
        firstParty
          ? "This site runs on this app, so it works without extra domains."
          : "The widget only loads on domains listed here once they're verified."
      }
    >
      <div className="flex gap-2">
        <Input
          placeholder="example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <Button disabled={!domain.trim() || addM.isPending} onClick={() => addM.mutate()}>
          <Globe2 className="size-4" /> Add
        </Button>
      </div>
      <ul className="mt-4 space-y-3 text-sm">
        {domains.map((d) => (
          <li key={d.domain} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{d.domain}</span>
              <div className="flex items-center gap-2">
                <StatusPill status={d.verifiedAt ? "verified" : "pending"} />
                {!d.verifiedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={chkM.isPending}
                    onClick={() => chkM.mutate(d.domain)}
                  >
                    Check now
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => delM.mutate(d.domain)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {!d.verifiedAt && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>
                  Add a DNS TXT record{" "}
                  <code className="text-foreground">
                    {VERIFY_TXT_PREFIX}.{d.domain}
                  </code>{" "}
                  with value <code className="break-all text-foreground">{d.token}</code>
                </p>
                <p>
                  or upload a file at{" "}
                  <code className="text-foreground">
                    https://{d.domain}
                    {VERIFY_FILE_PATH}
                  </code>{" "}
                  containing only that value.
                </p>
                {d.lastCheckError && <p className="text-destructive">{d.lastCheckError}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type KItem = {
  id: string;
  title: string;
  content: string;
  kind: string;
  category: string;
  status: string;
  updatedAt: string;
};
function KnowledgeReview({
  siteId,
  items,
  onChange,
}: {
  siteId: SiteId;
  items: KItem[];
  onChange: () => void;
}) {
  const review = useServerFn(adminReviewKnowledge);
  const m = useMutation({
    mutationFn: (v: { itemId: string; action: "approve" | "reject" }) =>
      review({ data: { siteId, ...v } }),
    onSuccess: onChange,
    onError: errMsg,
  });
  const pending = items.filter((i) => i.status === "needs_review");
  const approved = items.filter((i) => i.status === "approved").length;
  return (
    <Panel
      title="Knowledge review"
      description={`${pending.length} waiting · ${approved} approved and in use. Only approved knowledge reaches visitors.`}
    >
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>
      ) : (
        <ul className="divide-y divide-border">
          {pending.map((k) => (
            <li key={k.id} className="space-y-1.5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {k.title}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {k.category} · {k.kind}
                  </span>
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ itemId: k.id, action: "approve" })}
                  >
                    <CheckCircle2 className="size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ itemId: k.id, action: "reject" })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
              <p className="line-clamp-3 text-muted-foreground">{k.content}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
