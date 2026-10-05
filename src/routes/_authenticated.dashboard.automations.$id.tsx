import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Check, Copy, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReactivationModal } from "@/components/reactivation-modal";
import { generateMyInstallScript } from "@/lib/client-platform.functions";
import { TestChatPanel } from "@/components/test-chat-panel";
import { TranscriptEvaluator } from "@/components/transcript-evaluator";
import { useInstances } from "@/hooks/use-portal";
import { useFeatureFlag } from "@/hooks/use-system-settings";
import { automations } from "@/lib/automations";
import { daysRemaining, scriptTag, statusClass, statusLabels } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/dashboard/automations/$id")({
  head: () => ({
    meta: [
      { title: "Manage Automation — AntheticPlus Studios" },
      { name: "description", content: "Configure your AI automation, copy your embed script and view analytics." },
      { property: "og:title", content: "Manage AntheticPlus Automation" },
      { property: "og:description", content: "Your installation snippet, instructions and performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { data: instances = [], isLoading } = useInstances();
  const testChatOn = useFeatureFlag("test_chat");
  const evaluatorOn = useFeatureFlag("transcript_evaluator");
  const instance = instances.find((i) => i.id === id);
  const [copied, setCopied] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<string>("");
  const [generatingScript, setGeneratingScript] = useState(false);

  if (isLoading) return <p className="text-muted-foreground">Loading automation…</p>;
  if (!instance)
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <p className="font-bold">Automation not found.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/dashboard/automations">Back to my automations</Link>
        </Button>
      </div>
    );

  const meta = automations.find((a) => a.slug === instance.automation_slug);
  const left = daysRemaining(instance.expires_at);
  const frozen = instance.status === "suspended" || instance.status === "revoked";
  const live = instance.status === "paid" || instance.status === "active";
  const active = live && left > 0 && !frozen;
  const expired = live && left === 0;
  const script = generatedScript;

  return (
    <div className={`page-enter ${expired || frozen ? "rounded-3xl bg-destructive/5 p-4 sm:p-6" : ""}`}>
      {expired && !modalDismissed && (
        <ReactivationModal instance={instance} onClose={() => setModalDismissed(true)} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">Automation · {instance.client_id || instance.id.slice(0, 8)}</p>
          <h1 className="mt-2 text-3xl font-extrabold">{meta?.name ?? instance.automation_slug}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{instance.website_domain}</p>
        </div>
        <div className="text-right">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(instance.status)}`}>
            {statusLabels[instance.status] ?? instance.status}
          </span>
          <p className={`mt-3 text-4xl font-extrabold tabular-nums ${left <= 3 ? "text-destructive" : ""}`}>{left}</p>
          <p className="text-xs font-semibold uppercase text-muted-foreground">days remaining</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-extrabold">Installation</h2>
          {active ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Generate a fresh installation token, then add the script before the closing body tag.</p>
              {script ? (
                <pre className="mt-5 overflow-x-auto rounded-xl bg-muted p-4 text-xs"><code>{script}</code></pre>
              ) : (
                <div className="mt-5 rounded-xl bg-muted p-4 text-xs text-muted-foreground">Raw installation tokens are never returned from the database after generation. Generate a new script when you need to install or reinstall.</div>
              )}
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                This script will only work on {instance.website_domain}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" disabled={generatingScript} onClick={() => {
                  setGeneratingScript(true);
                  void generateMyInstallScript({ data: { automationId: instance.id } }).then((r) => { setGeneratedScript(r.snippet); setCopied(false); }).catch((e) => { console.error(e); }).finally(() => setGeneratingScript(false));
                }}>
                  {generatingScript ? "Generating…" : "Generate install script"}
                </Button>
                {script && <Button
                  variant="outline"
                  onClick={() => { void navigator.clipboard.writeText(script); setCopied(true); }}
                >{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy script"}</Button>}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/8 p-5">
              <p className="inline-flex items-center gap-2 font-extrabold text-destructive">
                <Lock className="h-4 w-4" />
                Script locked
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {frozen
                  ? "Your domain is frozen by AntheticPlus Studios. Contact antheticplusstudios@gmail.com."
                  : instance.status === "pending_payment"
                    ? "Your payment is awaiting verification. The snippet unlocks as soon as it is approved."
                    : "Submit a renewal transaction ID to unlock your snippet again."}
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <Link to="/dashboard/payments">Go to payments</Link>
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-extrabold">30-day performance</h2>
          <div className="mt-6 flex h-40 items-end gap-2" aria-label="Analytics preview">
            {[38, 55, 44, 72, 62, 85, 78, 96, 75, 88, 100, 90].map((v, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-primary/70" style={{ height: `${v}%` }} />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-primary">
            <BarChart3 className="h-4 w-4" />
            {instance.conversations_count.toLocaleString()} conversations · {instance.leads_count.toLocaleString()} leads
          </div>
        </section>
      </div>

      {testChatOn && <TestChatPanel automationId={instance.id} disabled={!active} />}

      {evaluatorOn && (
        <div className="mt-6">
          <TranscriptEvaluator automationId={instance.id} />
        </div>
      )}

      <section className="mt-6 rounded-3xl border border-border bg-card p-6">
        <h2 className="text-lg font-extrabold">Business context & AI instructions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted at checkout and tuned by our team. Email us to request changes.
        </p>
        <div className="mt-5 grid gap-4">
          <div className="rounded-2xl bg-muted/50 p-4 text-sm leading-6">
            {instance.business_context || "No business context submitted yet."}
          </div>
          <div className="rounded-2xl bg-muted/50 p-4 text-sm leading-6">
            {instance.system_prompt || (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <TriangleAlert className="h-4 w-4" />
                Your master prompt is being written by our deployment team.
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
