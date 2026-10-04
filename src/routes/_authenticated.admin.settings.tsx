import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPage, AreaField, Loading, Panel } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSystemSettings } from "@/lib/admin-data.functions";
import { saveSetting } from "@/lib/admin-center.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "System Settings — AntheticPlus Control Center" }] }),
  component: SettingsPage,
});

type Settings = Record<string, Record<string, unknown>>;

function SettingsPage() {
  const qc = useQueryClient();
  const save = useServerFn(saveSetting);
  const { data, isLoading } = useQuery({ queryKey: ["system-settings"], queryFn: () => getSystemSettings() });
  const [s, setS] = useState<Settings>({});
  useEffect(() => { if (data) setS(data); }, [data]);
  const m = useMutation({
    mutationFn: (key: "banner" | "maintenance" | "feature_flags") => save({ data: { key, value: s[key] ?? {} } }),
    onSuccess: () => {
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: ["system-settings"] });
      void qc.invalidateQueries({ queryKey: ["system-settings-public"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <Loading />;
  const patch = (key: string, field: string, v: unknown) => setS((x) => ({ ...x, [key]: { ...(x[key] ?? {}), [field]: v } }));
  const banner = s["banner"] ?? {};
  const maint = s["maintenance"] ?? {};
  const flags = s["feature_flags"] ?? {};
  const flagLabels: Record<string, string> = {
    transcript_evaluator: "Clients can grade conversations with AI",
    test_chat: "Clients can test their receptionist",
    public_storefront: "Storefront open for new orders",
    public_widget: "Public widget runtime enabled",
  };

  return (
    <AdminPage title="System Settings" subtitle="Site-wide banner, maintenance mode and feature switches. Every change is written to the audit trail.">
      <Panel title="Announcement banner" description="Shown at the top of every public and client page.">
        <label className="mb-3 flex items-center gap-2 text-sm"><Switch checked={!!banner["enabled"]} onCheckedChange={(v) => patch("banner", "enabled", v)} /> Show banner</label>
        <AreaField rows={2} value={String(banner["message"] ?? "")} onChange={(e) => patch("banner", "message", e.target.value)} placeholder="Scheduled maintenance this Friday 10pm UTC" />
        <Button className="mt-3" size="sm" onClick={() => m.mutate("banner")} disabled={m.isPending}>Save banner</Button>
      </Panel>
      <Panel title="Maintenance mode" description="Replaces the public storefront and client dashboard with a notice. The Control Center stays open for staff.">
        <label className="mb-3 flex items-center gap-2 text-sm"><Switch checked={!!maint["enabled"]} onCheckedChange={(v) => patch("maintenance", "enabled", v)} /> Maintenance mode on</label>
        <AreaField rows={2} value={String(maint["message"] ?? "")} onChange={(e) => patch("maintenance", "message", e.target.value)} />
        <Button className="mt-3" size="sm" onClick={() => m.mutate("maintenance")} disabled={m.isPending}>Save</Button>
      </Panel>
      <Panel title="Feature switches">
        <div className="grid gap-3">
          {Object.keys(flagLabels).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={flags[k] !== false} onCheckedChange={(v) => patch("feature_flags", k, v)} /> {flagLabels[k]}</label>
          ))}
        </div>
        <Button className="mt-3" size="sm" onClick={() => m.mutate("feature_flags")} disabled={m.isPending}>Save switches</Button>
      </Panel>
    </AdminPage>
  );
}
