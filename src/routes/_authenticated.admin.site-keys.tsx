import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, RotateCw, ShieldOff, PlugZap } from "lucide-react";
import {
  AdminPage,
  Panel,
  Loading,
  EmptyState,
  StatusPill,
  shortDate,
  timeAgo,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SITES, SITE_IDS, type SiteId } from "@/assistant/sites/site-registry";
import {
  SCOPE_LABELS,
  SITE_KEY_SCOPES,
  type SiteKeyScope,
  type SiteKeyKind,
} from "@/lib/site-keys";
import {
  adminCreateSiteKey,
  adminListSiteKeys,
  adminRevokeSiteKey,
  adminRotateSiteKey,
  adminSetRequireEmbedKey,
  adminTestSiteKey,
} from "@/lib/site-keys.functions";

export const Route = createFileRoute("/_authenticated/admin/site-keys")({
  head: () => ({
    meta: [
      { title: "Website Installation Keys — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Create, rotate, revoke and test website assistant installation keys.",
      },
      { property: "og:title", content: "Website Installation Keys" },
      {
        property: "og:description",
        content: "Manage scoped installation keys for client websites.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SiteKeysPage,
});

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
}

function SiteKeysPage() {
  const [site, setSite] = useState<SiteId>(SITE_IDS[0]);
  return (
    <AdminPage
      title="Website installation keys"
      subtitle="Scoped keys that let a client website or server talk to its assistant. Each key is shown once; only a scrambled copy is kept."
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
            {site === id && <SiteKeys siteId={id} />}
          </TabsContent>
        ))}
      </Tabs>
    </AdminPage>
  );
}

function SiteKeys({ siteId }: { siteId: SiteId }) {
  const qc = useQueryClient();
  const list = useServerFn(adminListSiteKeys);
  const create = useServerFn(adminCreateSiteKey);
  const rotate = useServerFn(adminRotateSiteKey);
  const revoke = useServerFn(adminRevokeSiteKey);
  const setReq = useServerFn(adminSetRequireEmbedKey);
  const qk = ["site-keys", siteId];
  const q = useQuery({ queryKey: qk, queryFn: () => list({ data: { siteId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: qk });

  const [revealed, setRevealed] = useState<{ secret: string; label: string } | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SiteKeyKind>("publishable");
  const [scopes, setScopes] = useState<SiteKeyScope[]>(["chat", "config"]);
  const [revoking, setRevoking] = useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = useState("");

  const onErr = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong");
  const createM = useMutation({
    mutationFn: () => create({ data: { siteId, label, kind, scopes } }),
    onSuccess: (r) => {
      setRevealed({ secret: r.secret, label: r.key.label });
      setLabel("");
      void refresh();
    },
    onError: onErr,
  });
  const rotateM = useMutation({
    mutationFn: (keyId: string) => rotate({ data: { siteId, keyId } }),
    onSuccess: (r) => {
      setRevealed({ secret: r.secret, label: r.key.label });
      void refresh();
    },
    onError: onErr,
  });
  const revokeM = useMutation({
    mutationFn: () => revoke({ data: { siteId, keyId: revoking!.id, reason } }),
    onSuccess: () => {
      toast.success("Key revoked");
      setRevoking(null);
      setReason("");
      void refresh();
    },
    onError: onErr,
  });
  const reqM = useMutation({
    mutationFn: (required: boolean) => setReq({ data: { siteId, required } }),
    onSuccess: () => void refresh(),
    onError: onErr,
  });

  if (q.isLoading) return <Loading label="Loading keys" />;
  if (q.error)
    return <EmptyState title="Couldn't load keys" description={(q.error as Error).message} />;
  const d = q.data!;
  const active = d.keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <Panel
        title="Create a key"
        description="Website keys (ap_pk_) are safe in page code and only work from the site's allowed domains. Server keys (ap_sk_) must stay on the client's server."
      >
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-label">Name</Label>
              <Input
                id="key-label"
                value={label}
                maxLength={80}
                placeholder="e.g. Main website widget"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["publishable", "secret"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={kind === k ? "default" : "outline"}
                  onClick={() => setKind(k)}
                >
                  {k === "publishable" ? "Website key" : "Server key"}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {SITE_KEY_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.includes(s)}
                    onCheckedChange={(c) =>
                      setScopes((p) => (c ? [...p, s] : p.filter((x) => x !== s)))
                    }
                  />
                  {SCOPE_LABELS[s]}
                </label>
              ))}
            </div>
          </div>
          <Button
            className="self-end"
            disabled={!label.trim() || !scopes.length || createM.isPending}
            onClick={() => createM.mutate()}
          >
            <KeyRound className="size-4" /> Create key
          </Button>
        </div>
      </Panel>

      <Panel
        title="Keys"
        description={`${active.length} active · Assistant ${d.enabled ? "on" : "off"} · Domains: ${d.domains.join(", ") || "none yet"}`}
        actions={
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={d.requireEmbedKey}
              disabled={reqM.isPending}
              onCheckedChange={(v) => reqM.mutate(v)}
            />
            Widget must send a website key
          </label>
        }
      >
        {d.keys.length === 0 ? (
          <EmptyState
            title="No keys yet"
            description="Create one above to install the assistant on this site."
          />
        ) : (
          <ul className="divide-y divide-border">
            {d.keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {k.label}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {k.kind === "publishable" ? "Website key" : "Server key"} ·{" "}
                    {k.scopes.map((s) => SCOPE_LABELS[s]).join(", ")} · v{k.version} · created{" "}
                    {shortDate(k.createdAt)} · last used{" "}
                    {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}
                    {k.revokedAt && ` · revoked: ${k.revokeReason ?? ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={k.revokedAt ? "revoked" : "active"} />
                  {!k.revokedAt && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rotateM.isPending}
                        onClick={() => rotateM.mutate(k.id)}
                      >
                        <RotateCw className="size-4" /> Rotate
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRevoking({ id: k.id, label: k.label })}
                      >
                        <ShieldOff className="size-4" /> Revoke
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConnectionTest siteId={siteId} />
      <InstallGuide siteId={siteId} requireKey={d.requireEmbedKey} />

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>
              "{revealed?.label}" is shown only this once. If you lose it, rotate the key to get a
              new one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={revealed?.secret ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => revealed && copy(revealed.secret)}>
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke "{revoking?.label}"?</DialogTitle>
            <DialogDescription>
              Any website or server using it stops working immediately. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || revokeM.isPending}
              onClick={() => revokeM.mutate()}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConnectionTest({ siteId }: { siteId: SiteId }) {
  const test = useServerFn(adminTestSiteKey);
  const [key, setKey] = useState("");
  const [scope, setScope] = useState<SiteKeyScope>("chat");
  const m = useMutation({
    mutationFn: () => test({ data: { siteId, key, scope } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test failed"),
  });
  return (
    <Panel
      title="Connection test"
      description="Paste a key to check it against this site. Doesn't use AI credits."
    >
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-64 flex-1 font-mono text-xs"
          placeholder="ap_pk_… or ap_sk_…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        {SITE_KEY_SCOPES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={scope === s ? "default" : "outline"}
            onClick={() => setScope(s)}
          >
            {s}
          </Button>
        ))}
        <Button disabled={key.length < 8 || m.isPending} onClick={() => m.mutate()}>
          <PlugZap className="size-4" /> Test
        </Button>
      </div>
      {m.data && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {m.data.checks.map((c) => (
            <li key={c.name} className="flex gap-2">
              <StatusPill status={c.ok ? "passed" : "failed"} />
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">— {c.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InstallGuide({ siteId, requireKey }: { siteId: SiteId; requireKey: boolean }) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const widget = `<script src="${base}/assistant.js" data-site-id="${siteId}"${requireKey ? ' data-site-key="ap_pk_YOUR_WEBSITE_KEY"' : ""} defer></script>`;
  const curl = `curl -X POST ${base}/api/public/assistant/chat \\
  -H "Authorization: Bearer $AP_SERVER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"site":"${siteId}","message":"What are your opening hours?","history":[]}'`;
  const node = `// Server only — never ship ap_sk_ keys to a browser.
const res = await fetch("${base}/api/public/assistant/chat", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.AP_SERVER_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ site: "${siteId}", message, history }),
});
const { reply } = await res.json();`;
  const Block = ({ title, code }: { title: string; code: string }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button size="sm" variant="ghost" onClick={() => copy(code)}>
          <Copy className="size-4" /> Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{code}</pre>
    </div>
  );
  return (
    <Panel
      title="Installation"
      description="Website widget for page code, or the server API for headless use."
    >
      <div className="space-y-5">
        <Block title="1. Website widget — paste before </body>" code={widget} />
        <Block title="2. Headless API — test with curl" code={curl} />
        <Block title="3. Headless API — from your server (Node)" code={node} />
        <p className="text-xs text-muted-foreground">
          The widget only loads on the site's allowed domains. Server keys skip the domain check, so
          keep them in server environment settings only.
        </p>
      </div>
    </Panel>
  );
}
