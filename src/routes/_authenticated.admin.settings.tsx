import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPage, AreaField, Loading, Panel } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { getSystemSettings } from "@/lib/admin-data.functions";
import { saveSetting } from "@/lib/admin-center.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Admin Settings in the AntheticPlus AI automation platform.",
      },
      { property: "og:title", content: "Admin Settings — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Admin Settings in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "System Settings — AntheticPlus Control Center" },
    ],
  }),
  component: SettingsPage,
});

type Settings = Record<string, Record<string, unknown>>;

function SettingsPage() {
  const qc = useQueryClient();
  const save = useServerFn(saveSetting);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => getSystemSettings(),
  });
  const [s, setS] = useState<Settings>({});
  const [confirm, setConfirm] = useState<"maintenance" | "feature_flags" | null>(null);
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  const m = useMutation({
    mutationFn: (key: "banner" | "maintenance" | "feature_flags") =>
      save({ data: { key, value: s[key] ?? {} } }),
    onSuccess: (result) => {
      if (!result.ok) throw new Error("The server did not confirm the change.");
      setConfirm(null);
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: ["system-settings"] });
      void qc.invalidateQueries({ queryKey: ["system-settings-public"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <AdminPage title="Platform settings" subtitle="Settings are unavailable.">
        <p role="alert" className="text-sm text-destructive">
          The saved settings could not be loaded. No defaults will overwrite your configuration.
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </AdminPage>
    );
  const dirty = (key: string) => JSON.stringify(s[key] ?? {}) !== JSON.stringify(data[key] ?? {});
  const discard = (key: string) => setS((current) => ({ ...current, [key]: data[key] ?? {} }));
  const patch = (key: string, field: string, v: unknown) =>
    setS((x) => ({ ...x, [key]: { ...(x[key] ?? {}), [field]: v } }));
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
    <AdminPage
      title="Platform settings"
      subtitle="Site-wide banner, maintenance mode and feature switches. Every change is written to the audit trail."
    >
      <Panel
        title="Announcement banner"
        description="Shown at the top of every public and client page."
      >
        <label className="mb-3 flex items-center gap-2 text-sm">
          <Switch
            checked={!!banner["enabled"]}
            onCheckedChange={(v) => patch("banner", "enabled", v)}
          />{" "}
          Show banner
        </label>
        <AreaField
          aria-label="Announcement message"
          rows={2}
          value={String(banner["message"] ?? "")}
          onChange={(e) => patch("banner", "message", e.target.value)}
          placeholder="Scheduled maintenance this Friday 10pm UTC"
        />
        <Button
          className="mt-3"
          size="sm"
          onClick={() => m.mutate("banner")}
          disabled={
            m.isPending ||
            !dirty("banner") ||
            (!!banner["enabled"] && !String(banner["message"] ?? "").trim())
          }
        >
          {m.isPending && m.variables === "banner" ? "Saving…" : "Save banner"}
        </Button>
        <Button
          className="ml-2"
          size="sm"
          variant="ghost"
          disabled={m.isPending || !dirty("banner")}
          onClick={() => discard("banner")}
        >
          Discard
        </Button>
      </Panel>
      <Panel
        title="Maintenance mode"
        description="Replaces the public storefront and client dashboard with a notice. The Control Center stays open for staff."
      >
        <label className="mb-3 flex items-center gap-2 text-sm">
          <Switch
            checked={!!maint["enabled"]}
            onCheckedChange={(v) => patch("maintenance", "enabled", v)}
          />{" "}
          Maintenance mode on
        </label>
        <AreaField
          aria-label="Maintenance message"
          rows={2}
          value={String(maint["message"] ?? "")}
          onChange={(e) => patch("maintenance", "message", e.target.value)}
        />
        <Button
          className="mt-3"
          size="sm"
          onClick={() => setConfirm("maintenance")}
          disabled={m.isPending || !dirty("maintenance")}
        >
          Save maintenance
        </Button>
        <Button
          className="ml-2"
          size="sm"
          variant="ghost"
          disabled={m.isPending || !dirty("maintenance")}
          onClick={() => discard("maintenance")}
        >
          Discard
        </Button>
      </Panel>
      <Panel title="Feature switches">
        <div className="grid gap-3">
          {Object.keys(flagLabels).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Switch
                checked={flags[k] !== false}
                onCheckedChange={(v) => patch("feature_flags", k, v)}
              />{" "}
              {flagLabels[k]}
            </label>
          ))}
        </div>
        <Button
          className="mt-3"
          size="sm"
          onClick={() => setConfirm("feature_flags")}
          disabled={m.isPending || !dirty("feature_flags")}
        >
          {m.isPending && m.variables === "feature_flags" ? "Saving…" : "Save switches"}
        </Button>
        <Button
          className="ml-2"
          size="sm"
          variant="ghost"
          disabled={m.isPending || !dirty("feature_flags")}
          onClick={() => discard("feature_flags")}
        >
          Discard
        </Button>
      </Panel>
      {m.error && (
        <p role="alert" className="text-sm text-destructive">
          {m.error.message}
        </p>
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !m.isPending) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply platform-wide changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "maintenance"
                ? "This changes access to the storefront and client workspace. Staff administration remains available."
                : "Feature changes affect client and public workflows immediately. Disabled capabilities may stop serving visitors."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={m.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) m.mutate(confirm);
              }}
            >
              {m.isPending ? "Saving…" : "Apply changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}
