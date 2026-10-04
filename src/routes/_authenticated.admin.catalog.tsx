import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, AreaField, Loading, Panel, TextField } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAllInstances, usePricing } from "@/hooks/use-admin";
import { bulkKill, saveCatalogItem } from "@/lib/admin-center.functions";

export const Route = createFileRoute("/_authenticated/admin/catalog")({
  head: () => ({ meta: [{ title: "All Automations — AntheticPlus Control Center" }] }),
  component: CatalogPage,
});

type Plan = {
  slug: string;
  name: string;
  description: string;
  monthly_price: number;
  yearly_discount_pct: number;
  active: boolean;
  listed: boolean;
};

const blank: Plan = { slug: "", name: "", description: "", monthly_price: 0, yearly_discount_pct: 20, active: true, listed: false };

function Editor({ plan, isNew, deployed, live, onDone }: { plan: Plan; isNew: boolean; deployed: number; live: number; onDone?: () => void }) {
  const [p, setP] = useState(plan);
  const qc = useQueryClient();
  const save = useServerFn(saveCatalogItem);
  const kill = useServerFn(bulkKill);
  const m = useMutation({
    mutationFn: () => save({ data: { ...p, monthly_price: Number(p.monthly_price), yearly_discount_pct: Number(p.yearly_discount_pct), isNew } }),
    onSuccess: () => {
      toast.success(isNew ? "Automation added" : "Saved");
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const k = useMutation({
    mutationFn: (killed: boolean) => kill({ data: { slug: p.slug, killed } }),
    onSuccess: (_, killed) => {
      toast.success(killed ? "All instances paused" : "All instances resumed");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = <K extends keyof Plan>(key: K, v: Plan[K]) => setP((x) => ({ ...x, [key]: v }));

  return (
    <Panel
      title={isNew ? "New automation" : p.name || p.slug}
      description={isNew ? "Add a new offering to the catalog" : `${p.slug} · ${deployed} deployed · ${live} live`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {isNew && <TextField placeholder="slug (e.g. booking-agent)" value={p.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />}
        <TextField placeholder="Display name" value={p.name} onChange={(e) => set("name", e.target.value)} />
        <TextField type="number" placeholder="Monthly price" value={p.monthly_price} onChange={(e) => set("monthly_price", Number(e.target.value))} />
        <TextField type="number" placeholder="Yearly discount %" value={p.yearly_discount_pct} onChange={(e) => set("yearly_discount_pct", Number(e.target.value))} />
      </div>
      <AreaField className="mt-3" rows={3} placeholder="Short description" value={p.description} onChange={(e) => set("description", e.target.value)} />
      <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2"><Switch checked={p.active} onCheckedChange={(v) => set("active", v)} /> Available to buy</label>
        <label className="flex items-center gap-2"><Switch checked={p.listed} onCheckedChange={(v) => set("listed", v)} /> Shown on homepage</label>
        <div className="ml-auto flex gap-2">
          {!isNew && (
            <>
              <Button size="sm" variant="outline" onClick={() => k.mutate(true)} disabled={k.isPending || !deployed}>Pause all</Button>
              <Button size="sm" variant="outline" onClick={() => k.mutate(false)} disabled={k.isPending || !deployed}>Resume all</Button>
            </>
          )}
          <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !p.slug || !p.name}>Save</Button>
        </div>
      </div>
    </Panel>
  );
}

function CatalogPage() {
  const { data: plans = [], isLoading } = usePricing();
  const { data: instances = [] } = useAllInstances();
  const [adding, setAdding] = useState(false);
  if (isLoading) return <Loading />;
  return (
    <AdminPage
      title="All Automations"
      subtitle="Edit every offering, control whether it can be bought or shown on the homepage, and pause deployed instances."
      actions={<Button onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Add automation"}</Button>}
    >
      {adding && <Editor plan={blank} isNew onDone={() => setAdding(false)} deployed={0} live={0} />}
      <div className="grid gap-6 xl:grid-cols-2">
        {(plans as Plan[]).map((p) => {
          const mine = instances.filter((i: { automation_slug: string }) => i.automation_slug === p.slug);
          const live = mine.filter((i: { status: string; killed: boolean }) => i.status === "active" && !i.killed).length;
          return <Editor key={p.slug} plan={{ ...p, description: p.description ?? "" }} isNew={false} deployed={mine.length} live={live} />;
        })}
      </div>
    </AdminPage>
  );
}
