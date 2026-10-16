import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink, Monitor, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assistantWidgetSource } from "@/assistant/widget/assistant-widget-source";
import { SITES, type SiteId } from "@/assistant/sites/site-registry";
import type { SitePublicConfig } from "@/assistant/sites/site-config.types";
import { adminGetSiteConfig } from "@/lib/web-assistant-admin.functions";

export function WidgetInstallationWorkspace({
  siteId,
  requireKey,
}: {
  siteId: SiteId;
  requireKey: boolean;
}) {
  const get = useServerFn(adminGetSiteConfig);
  const q = useQuery({
    queryKey: ["web-assistant", siteId],
    queryFn: () => get({ data: { siteId } }),
  });
  const [base, setBase] = useState("");
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [manualChecked, setManualChecked] = useState(false);
  useEffect(() => {
    setBase(window.location.origin);
  }, []);
  useEffect(() => {
    setKey("");
    setCopied(false);
    setManualChecked(false);
  }, [siteId]);
  const c = q.data?.config;
  const validKey = !requireKey || /^ap_pk_[a-zA-Z0-9_-]+$/.test(key);
  const snippet =
    base && validKey
      ? `<script src="${base}/assistant.js" data-site-id="${siteId}"${requireKey ? ` data-site-key="${key}"` : ""} defer></script>`
      : "";
  const preview = useMemo(() => {
    if (!c || !base) return "";
    const cfg: SitePublicConfig = {
      siteId,
      enabled: true,
      voiceEnabled: false,
      displayName: c.displayName,
      welcomeMessage: c.welcomeMessage,
      branding: c.branding,
      voice: c.voice,
    };
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#eaf0ee;font:14px system-ui;color:#40534d}main{padding:28px}h2{font-size:20px}p{max-width:260px;line-height:1.7}</style></head><body><main><h2>${SITES[siteId].name}</h2><p>Widget appearance preview. No live AI responses are generated here.</p></main><script>${assistantWidgetSource(base, cfg).replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  }, [c, base, siteId]);
  async function copy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Installation snippet copied");
    } catch {
      toast.error("Copy failed. Select and copy the snippet instead.");
    }
  }
  return (
    <section className="space-y-5 border-t border-border pt-7">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Monitor className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold">Install your website assistant</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Preview, install, and check the same widget your visitors will see.
          </p>
        </div>
      </div>
      <Tabs defaultValue="preview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {["preview", "appearance", "install", "test", "troubleshooting"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="preview" className="mt-5">
          {q.isLoading ? (
            <p aria-busy="true" className="text-sm text-muted-foreground">
              Loading saved appearance…
            </p>
          ) : q.error ? (
            <div role="alert">
              <p className="text-sm text-destructive">Saved appearance could not be loaded.</p>
              <Button variant="outline" onClick={() => void q.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="install-preview">
              <iframe
                title={`${SITES[siteId].name} widget appearance preview`}
                sandbox="allow-scripts"
                srcDoc={preview}
              />
            </div>
          )}
        </TabsContent>
        <TabsContent value="appearance" className="mt-5 space-y-4">
          <h3 className="font-medium">Saved assistant appearance</h3>
          <p className="text-sm text-muted-foreground">
            Name, welcome message, colors, and launcher position come from this assistant’s
            settings. Save a draft, then publish to update visitors.
          </p>
          <Button asChild variant="outline">
            <Link to="/admin/assistants/$site" params={{ site: siteId }}>
              Edit appearance <ExternalLink />
            </Link>
          </Button>
        </TabsContent>
        <TabsContent value="install" className="mt-5 space-y-5">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Approve and verify the website domain in Publishing.</li>
            <li>Save your assistant settings and publish the draft.</li>
            <li>
              Paste this script immediately before the closing body tag on each eligible page.
            </li>
          </ol>
          {requireKey && (
            <div className="space-y-2">
              <Label htmlFor="install-public-key">Website key</Label>
              <Input
                id="install-public-key"
                autoComplete="off"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value.trim());
                  setCopied(false);
                }}
                placeholder="Paste the ap_pk_ website key you saved"
              />
              <p className="text-xs text-muted-foreground">
                Only a publishable website key belongs here. Never paste an ap_sk_ server key.
              </p>
              {key && !validKey && (
                <p role="alert" className="text-xs text-destructive">
                  Enter a valid ap_pk_ website key.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Website installation snippet</Label>
              <Button size="sm" variant="outline" disabled={!snippet} onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-4 text-xs">
              {snippet ||
                (requireKey
                  ? "Paste your website key to generate the installation snippet."
                  : "Loading deployment URL…")}
            </pre>
          </div>
          <Button asChild variant="ghost">
            <Link to="/admin/agent-publishing">
              Review publishing & verified domains <ExternalLink />
            </Link>
          </Button>
        </TabsContent>
        <TabsContent value="test" className="mt-5 space-y-5">
          <h3 className="font-medium">Check the live installation</h3>
          <p className="text-sm text-muted-foreground">
            Open your website in a private window. Confirm the launcher appears, opens, and returns
            an assistant reply. A key connection test checks credentials, not whether the script is
            installed.
          </p>
          <Button asChild variant="outline">
            <Link to="/admin/assistants/$site" params={{ site: siteId }}>
              Open real conversation test
            </Link>
          </Button>
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <span className="text-sm">
              {manualChecked
                ? "Manually checked for this session — not automatically verified"
                : "Installation not checked"}
            </span>
          </div>
          <Button variant="outline" onClick={() => setManualChecked((v) => !v)}>
            {manualChecked ? "Clear manual check" : "Record my manual check"}
          </Button>
        </TabsContent>
        <TabsContent value="troubleshooting" className="mt-5">
          <dl className="space-y-5 text-sm">
            <div>
              <dt className="font-medium">Launcher does not appear</dt>
              <dd className="mt-1 text-muted-foreground">
                Check the script URL, published enabled state, approved domain, required website
                key, and your site’s content security policy.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Launcher opens but messages fail</dt>
              <dd className="mt-1 text-muted-foreground">
                Check the assistant provider connection and request limits. Retry after temporary
                network or rate-limit errors.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Old appearance remains</dt>
              <dd className="mt-1 text-muted-foreground">
                Publish your draft and reload the website. The embed script may remain cached for
                five minutes.
              </dd>
            </div>
          </dl>
        </TabsContent>
      </Tabs>
    </section>
  );
}
