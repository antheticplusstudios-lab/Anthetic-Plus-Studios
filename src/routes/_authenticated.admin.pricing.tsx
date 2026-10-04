import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AdminPage, Loading, Panel, shortDate } from "@/components/admin-ui";
import { usePricing, usePromos } from "@/hooks/use-admin";
import { adminSavePricing, adminUpdatePromo, adminDeletePromo, adminCreatePromo } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/pricing")({ component: PricingPage });

type Plan = {
  slug: string;
  name: string;
  monthly_price: number;
  yearly_discount_pct: number;
  active: boolean;
};

type Promo = {
  id: string;
  code: string;
  percent_off: number;
  active: boolean;
  expires_at: string | null;
};

function PlanCard({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(plan.name);
  const [monthly, setMonthly] = useState(String(plan.monthly_price));
  const [discount, setDiscount] = useState(String(plan.yearly_discount_pct));
  const [active, setActive] = useState(plan.active);
  const [saving, setSaving] = useState(false);

  const monthlyNum = Number(monthly) || 0;
  const discountNum = Number(discount) || 0;
  const yearly = Math.round(monthlyNum * 12 * (1 - discountNum / 100));

  const save = async () => {
    setSaving(true);
    try { await adminSavePricing({ data: { slug: plan.slug, name, monthly_price: monthlyNum, yearly_price: yearly, yearly_discount_pct: discountNum, active, listed: true } }); }
    catch (e) { setSaving(false); toast.error(e instanceof Error ? e.message : "Save failed"); return; }
    setSaving(false);
    toast.success("Pricing plan saved");
    void queryClient.invalidateQueries({ queryKey: ["admin", "pricing"] });
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{plan.slug}</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Monthly price</label>
          <Input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Yearly discount %</label>
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Yearly price: <span className="font-bold tabular-nums text-foreground">${yearly.toLocaleString()}</span>
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} />
          <span className="text-sm">{active ? "Active" : "Inactive"}</span>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function PromoRow({ promo }: { promo: Promo }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(promo.active);

  const toggle = async (value: boolean) => {
    setActive(value);
    try { await adminUpdatePromo({ data: { id: promo.id, active: value } }); void queryClient.invalidateQueries({ queryKey: ["admin", "promos"] }); }
    catch (e) { setActive(!value); toast.error(e instanceof Error ? e.message : "Update failed"); }
  };

  const remove = async () => {
    try { await adminDeletePromo({ data: { id: promo.id } }); toast.success("Promo code removed"); void queryClient.invalidateQueries({ queryKey: ["admin", "promos"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div>
        <p className="font-extrabold uppercase tracking-wide">{promo.code}</p>
        <p className="text-xs text-muted-foreground">
          {promo.percent_off}% off · {promo.expires_at ? shortDate(promo.expires_at) : "No expiry"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={(v) => void toggle(v)} />
          <span className="text-xs font-semibold">{active ? "Active" : "Inactive"}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void remove()}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function CreatePromoForm() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    const trimmed = code.trim().toUpperCase();
    const pct = Number(percentOff);
    if (!trimmed || !pct || pct < 1 || pct > 90) {
      toast.error("Provide a code and a percent off between 1 and 90.");
      return;
    }
    setSaving(true);
    try { await adminCreatePromo({ data: { code: trimmed, percent_off: pct, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null } }); }
    catch (e) { setSaving(false); toast.error(e instanceof Error ? e.message : "Create failed"); return; }
    setSaving(false);
    toast.success("Promo code created");
    setCode("");
    setPercentOff("10");
    setExpiresAt("");
    void queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
  };

  return (
    <div className="grid gap-3 rounded-xl border border-dashed border-border p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <Input placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} />
      <Input type="number" min={1} max={90} placeholder="% off" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} />
      <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      <Button onClick={() => void create()} disabled={saving}>
        {saving ? "Creating…" : "Create promo"}
      </Button>
    </div>
  );
}

function PricingPage() {
  const { data: plans, isLoading: loadingPlans } = usePricing();
  const { data: promos, isLoading: loadingPromos } = usePromos();

  if (loadingPlans || loadingPromos) return <Loading />;

  const planRows = (plans ?? []) as Plan[];
  const promoRows = (promos ?? []) as Promo[];

  return (
    <AdminPage
      title="Global Pricing Configurator"
      subtitle="The live price matrix both storefronts read from, plus promo codes."
    >
      <Panel title="Price matrix" description="Storefront prices and checkout totals come from this table in real time, so changes apply without redeploying.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planRows.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} />
          ))}
        </div>
      </Panel>

      <Panel title="Promo codes">
        <div className="grid gap-3">
          {promoRows.map((promo) => (
            <PromoRow key={promo.id} promo={promo} />
          ))}
          {promoRows.length === 0 && <p className="text-sm text-muted-foreground">No promo codes yet.</p>}
          <CreatePromoForm />
        </div>
      </Panel>
    </AdminPage>
  );
}
