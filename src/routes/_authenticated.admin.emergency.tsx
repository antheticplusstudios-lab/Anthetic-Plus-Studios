import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, Power, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AdminPage, Loading, Panel, StatCard } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSystemSettings } from "@/lib/admin-data.functions";
import { bulkKill, saveSetting } from "@/lib/admin-center.functions";

export const Route = createFileRoute("/_authenticated/admin/emergency")({
  head: () => ({ meta: [{ title: "Emergency Controls — AntheticPlus Control Center" }] }),
  component: EmergencyPage,
});

type Settings = Record<string, Record<string, unknown>>;

function EmergencyPage() {
  const qc = useQueryClient();
  const save = useServerFn(saveSetting);
  const kill = useServerFn(bulkKill);
  const { data, isLoading, error } = useQuery({ queryKey: ["system-settings"], queryFn: () => getSystemSettings() });
  const [settings, setSettings] = useState<Settings>({});
  useEffect(() => { if (data) setSettings(data); }, [data]);

  const mutation = useMutation({
    mutationFn: async (task: "pause" | "resume" | "widget" | "storefront" | "maintenance") => {
      if (task === "pause" || task === "resume") {
        return kill({ data: { slug: null, killed: task === "pause" } });
      }
      if (task === "widget") {
        const next = flags.public_widget === false;
        return save({ data: { key: "feature_flags", value: { public_widget: next } } });
      }
      if (task === "storefront") {
        const next = flags.public_storefront === false;
        return save({ data: { key: "feature_flags", value: { public_storefront: next } } });
      }
      const next = maint.enabled === true;
      return save({ data: { key: "maintenance", value: { enabled: !next, message: String(maint.message ?? "") } } });
    },
    onSuccess: (_, task) => {
      const labels: Record<string, string> = {
        pause: "All automations paused",
        resume: "All automations resumed",
        widget: "Public widget switch updated",
        storefront: "Storefront switch updated",
        maintenance: "Maintenance mode updated",
      };
      toast.success(labels[task]);
      void qc.invalidateQueries({ queryKey: ["system-settings"] });
      void qc.invalidateQueries({ queryKey: ["system-settings-public"] });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loading label="Loading emergency controls" />;
  if (error) return <Panel title="Emergency controls unavailable">{(error as Error).message}</Panel>;

  const flags = settings.feature_flags ?? {};
  const maint = settings.maintenance ?? {};
  const widgetOn = flags.public_widget !== false;
  const storefrontOn = flags.public_storefront !== false;
  const maintenanceOn = maint.enabled === true;

  const act = (task: "pause" | "resume" | "widget" | "storefront" | "maintenance", message: string) => {
    if (window.confirm(message)) mutation.mutate(task);
  };

  return (
    <AdminPage
      title="Emergency Controls"
      subtitle="Owner-only operational kill switches for customer-facing runtime paths. Every action is server-side and audited."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Public widget" value={widgetOn ? "ONLINE" : "OFFLINE"} tone={widgetOn ? "good" : "bad"} icon={<Power className="h-4 w-4" />} />
        <StatCard label="Storefront" value={storefrontOn ? "OPEN" : "CLOSED"} tone={storefrontOn ? "good" : "bad"} icon={<ShieldAlert className="h-4 w-4" />} />
        <StatCard label="Maintenance" value={maintenanceOn ? "ON" : "OFF"} tone={maintenanceOn ? "warn" : "neutral"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <Panel title="Runtime kill switches" description="Use these during an incident or controlled maintenance window. Changes take effect through the authoritative server paths.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">Pause all automations</p>
                <p className="mt-1 text-xs text-muted-foreground">Moves every deployed automation to the paused runtime state. Resume restores active state.</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="destructive" onClick={() => act("pause", "Pause every deployed automation now?")} disabled={mutation.isPending}>Pause all</Button>
              <Button variant="outline" onClick={() => act("resume", "Resume every deployed automation now?")} disabled={mutation.isPending}>Resume all</Button>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Public widget runtime</p>
                <p className="mt-1 text-xs text-muted-foreground">Immediately blocks new widget config/resolve/chat requests at FastAPI.</p>
              </div>
              <Switch checked={widgetOn} onCheckedChange={() => act("widget", `${widgetOn ? "Disable" : "Enable"} the public widget runtime?`)} disabled={mutation.isPending} />
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Public storefront</p>
                <p className="mt-1 text-xs text-muted-foreground">Stops new orders from being exposed by the storefront feature flag.</p>
              </div>
              <Switch checked={storefrontOn} onCheckedChange={() => act("storefront", `${storefrontOn ? "Close" : "Open"} the public storefront?`)} disabled={mutation.isPending} />
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Maintenance mode</p>
                <p className="mt-1 text-xs text-muted-foreground">Routes the public/client experience through the existing maintenance gate while keeping Control Center available.</p>
              </div>
              <Switch checked={maintenanceOn} onCheckedChange={() => act("maintenance", `${maintenanceOn ? "Disable" : "Enable"} maintenance mode?`)} disabled={mutation.isPending} />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Operational note" description="These controls change platform state; use normal automation-level controls for routine client-specific changes. The audit trail records the actor, target and resulting state.">{null}</Panel>
    </AdminPage>
  );
}
