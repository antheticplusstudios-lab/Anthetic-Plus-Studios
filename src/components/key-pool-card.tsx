import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Activity } from "lucide-react";
import { Panel, EmptyState, shortDate, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminAddIntegrationKey,
  adminDeleteIntegrationKey,
  adminTestIntegrationKey,
  adminToggleIntegrationKey,
} from "@/lib/integration-keys.functions";
import type { KeyPoolView } from "@/lib/integration-keys";

export function Pill({ tone, text }: { tone: "good" | "warn" | "off"; text: string }) {
  const cls =
    tone === "good"
      ? "bg-success/12 text-success"
      : tone === "warn"
        ? "bg-destructive/12 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}

export function PoolCard({
  scope,
  pool,
  keys,
}: {
  scope: string;
  pool: { provider: string; label: string; maxKeys: number; hint: string; placeholder: string };
  keys: KeyPoolView[];
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const addFn = useServerFn(adminAddIntegrationKey);
  const toggleFn = useServerFn(adminToggleIntegrationKey);
  const deleteFn = useServerFn(adminDeleteIntegrationKey);
  const testFn = useServerFn(adminTestIntegrationKey);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["integration-keys"] });
  const full = keys.length >= pool.maxKeys;
  const liveCount = keys.filter((k) => k.enabled).length;

  async function submit() {
    try {
      await addFn({ data: { scope, provider: pool.provider, label, secret } });
      toast.success("Key added");
      setOpen(false);
      setLabel("");
      setSecret("");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggle(k: KeyPoolView, enabled: boolean) {
    try {
      await toggleFn({ data: { id: k.id, enabled } });
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(k: KeyPoolView) {
    try {
      await deleteFn({ data: { id: k.id } });
      toast.success("Key removed");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function test(k: KeyPoolView) {
    setTesting(k.id);
    try {
      const res = await testFn({ data: { id: k.id } });
      if (res.ok) toast.success(`${k.label}: ${res.message}`);
      else toast.error(`${k.label}: ${res.message}`);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(null);
    }
  }

  return (
    <Panel
      title={pool.label}
      description={pool.hint}
      actions={
        <div className="flex items-center gap-2">
          <Pill tone={liveCount > 0 ? "good" : "warn"} text={`${liveCount}/${pool.maxKeys} live`} />
          <Button size="sm" disabled={full} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add key
          </Button>
        </div>
      }
    >
      {keys.length === 0 ? (
        <EmptyState
          title={`No ${pool.label.toLowerCase()} yet`}
          description={`Add up to ${pool.maxKeys}. When one hits its limit the next takes over automatically.`}
        />
      ) : (
        <ul className="divide-y">
          {keys.map((k) => {
            const cooling = new Date(k.cooldownUntil).getTime() > Date.now();
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-40 flex-1">
                  <div className="font-medium">{k.label}</div>
                  <div className="text-muted-foreground text-xs">
                    ••••{k.tail} · added {shortDate(k.createdAt)}
                  </div>
                </div>
                <div className="text-muted-foreground text-xs">
                  {k.uses} uses · {k.failures} fails
                </div>
                <Pill
                  tone={!k.enabled ? "off" : cooling ? "warn" : "good"}
                  text={
                    !k.enabled
                      ? "Off"
                      : cooling
                        ? `Resting · back ${timeAgo(k.cooldownUntil)}`
                        : "Ready"
                  }
                />
                <Switch checked={k.enabled} onCheckedChange={(v) => toggle(k, v)} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === k.id}
                  onClick={() => test(k)}
                >
                  <Activity className="mr-1 h-4 w-4" />
                  {testing === k.id ? "Testing…" : "Test"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(k)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {pool.label}</DialogTitle>
            <DialogDescription>
              Stored encrypted and never shown again. {keys.length}/{pool.maxKeys} used.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="key-label">Name</Label>
              <Input
                id="key-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Inworld account 1"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-secret">Key</Label>
              <Input
                id="key-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={pool.placeholder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!label.trim() || secret.trim().length < 8} onClick={submit}>
              Save key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
