import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loading, Panel, StatusPill } from "@/components/admin-ui";
import { useAllInstances, useProvisionAutomation } from "@/hooks/use-admin";
import { hostFromUrl } from "@/lib/portal";
import { adminListAutomations } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/creator")({
  component: AutomationCreator,
});

const notReadyStatuses = ["pending_payment", "stopped", "revoked", "suspended"];

const blockedReasons: Record<string, string> = {
  pending_payment: "Awaiting payment verification.",
  stopped: "Subscription has stopped; renewal required.",
  revoked: "Access was revoked by staff.",
  suspended: "Domain frozen — contact the client before reactivating.",
};

function AutomationCreator() {
  const { data: instances = [], isLoading } = useAllInstances();
  const provision = useProvisionAutomation();
  const [deployed, setDeployed] = useState<{
    instanceId: string;
    clientId: string;
    snippet: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <Loading />;

  type AutomationSummary = Awaited<ReturnType<typeof adminListAutomations>>[number];
  const readyToDeploy = instances.filter(
    (i: AutomationSummary) => i.status === "paid" || i.status === "active",
  );
  const notReady = instances.filter((i: AutomationSummary) => notReadyStatuses.includes(i.status));

  const handleDeploy = (instance: AutomationSummary) => {
    provision.mutate(
      { automationId: instance.id },
      {
        onSuccess: (result) => {
          setDeployed({
            instanceId: instance.id,
            clientId: result.clientId,
            snippet: `<script src="${window.location.origin}/widget.js" data-client-id="${result.clientId}" data-automation-id="${instance.id}" data-token="${result.scriptToken}" defer></script>`,
          });
        },
      },
    );
  };

  const script = deployed?.snippet ?? "";

  return (
    <div className="page-enter space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Automation Creator</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Bind a client ID and a domain to the embed script in one click, flip the automation to
          Active and hand the client the snippet. Provisioning requires the payment to be approved
          first — the server rejects otherwise.
        </p>
      </div>

      {deployed && (
        <Panel title="Deployed" description="Hand this snippet to the client">
          <p className="text-sm">
            Client ID: <span className="font-bold tabular-nums">{deployed.clientId}</span>
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-xs">
            <code>{script}</code>
          </pre>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              if (navigator.clipboard) {
                void navigator.clipboard.writeText(script);
                setCopied(true);
                toast.success("Script copied");
              } else {
                toast.error("Clipboard unavailable — copy manually");
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy script"}
          </Button>
        </Panel>
      )}

      <Panel
        title="Ready to deploy"
        description="Paid or active instances awaiting a locked domain"
      >
        {readyToDeploy.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing to deploy right now.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {readyToDeploy.map((instance: AutomationSummary) => (
              <div key={instance.id} className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{instance.automation_slug}</p>
                    <p className="text-xs text-muted-foreground">{instance.website_domain}</p>
                  </div>
                  <StatusPill status={instance.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  User {instance.user_id?.slice(0, 8)}…
                </p>
                <Button
                  className="mt-3 w-full"
                  disabled={provision.isPending}
                  onClick={() => handleDeploy(instance)}
                >
                  Lock & deploy
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Not ready yet" description="Blocked by payment, status or account state">
        {notReady.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing blocked right now.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {notReady.map((instance: AutomationSummary) => (
              <div key={instance.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{instance.automation_slug}</p>
                    <p className="text-xs text-muted-foreground">{instance.website_domain}</p>
                  </div>
                  <StatusPill status={instance.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {blockedReasons[instance.status] ?? "Blocked."}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Domain lock">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          The widget only answers requests from the recorded domain. Example:{" "}
          {readyToDeploy[0] ? hostFromUrl(readyToDeploy[0].website_domain) : "example.com"} —
          locking a mismatched domain will silently disable the widget for visitors.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Need to review a pending payment first? Head to the{" "}
          <Link to="/admin/verification" className="font-bold text-primary underline">
            verification queue
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}
