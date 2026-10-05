import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, Panel } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminListPaymentMethods, adminSavePaymentMethod } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  head: () => ({ meta: [{ title: "Payment Methods — AntheticPlus" }] }),
  component: PaymentMethodsPage,
});

function PaymentMethodsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-pm"],
    queryFn: async () => {
return adminListPaymentMethods();
    },
  });
  const [n, setN] = useState({ method_name: "", instructions: "", fields: "sender_phone, trx_id" });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-pm"] }); void qc.invalidateQueries({ queryKey: ["payment-methods-active"] }); };
  const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function save(id: string, patch: Record<string, unknown>) {
    const current = (list.data ?? []).find((x: any) => x.id === id) as any;
    try { await adminSavePaymentMethod({ data: { id, method_name: String(current?.method_name ?? "Payment method"), instructions: String(patch.instructions ?? current?.instructions ?? ""), required_fields: (patch.required_fields as string[]) ?? ((current?.required_fields as string[]) ?? []), is_active: Boolean(patch.is_active ?? current?.is_active ?? true) } }); toast.success("Saved"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  }
  async function add() {
    try { await adminSavePaymentMethod({ data: { id: null, method_name: n.method_name, instructions: n.instructions, required_fields: parse(n.fields), is_active: true } }); setN({ method_name: "", instructions: "", fields: "sender_phone, trx_id" }); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Add failed"); }
  }

  return (
    <AdminPage title="Payment Methods" subtitle="What customers see at the payment step of checkout.">
      <div className="grid gap-4">
        {(list.data ?? []).map((m) => <MethodCard key={m.id} m={m} onSave={save} parse={parse} />)}
        <Panel title="Add a payment method">
          <div className="grid gap-3">
            <Input placeholder="Name, e.g. Rocket" value={n.method_name} onChange={(e) => setN({ ...n, method_name: e.target.value })} />
            <Textarea placeholder="Instructions shown to the customer" value={n.instructions} onChange={(e) => setN({ ...n, instructions: e.target.value })} />
            <Input placeholder="Required fields, comma separated" value={n.fields} onChange={(e) => setN({ ...n, fields: e.target.value })} />
            <Button disabled={!n.method_name || !n.instructions} onClick={() => void add()}>Add</Button>
          </div>
        </Panel>
      </div>
    </AdminPage>
  );
}

type M = { id: string; method_name: string; instructions: string; required_fields: unknown; is_active: boolean; is_card: boolean };
function MethodCard({ m, onSave, parse }: { m: M; onSave: (id: string, p: Record<string, unknown>) => Promise<unknown>; parse: (s: string) => string[] }) {
  const [s, setS] = useState({ instructions: m.instructions, fields: ((m.required_fields as string[]) ?? []).join(", ") });
  return (
    <Panel title={m.method_name} description={m.is_card ? "Card payments go live once Stripe/PayPal is connected." : undefined} actions={<Switch checked={m.is_active} disabled={m.is_card} onCheckedChange={(v) => void onSave(m.id, { is_active: v })} />}>
      <div className="grid gap-2">
        <Textarea value={s.instructions} onChange={(e) => setS({ ...s, instructions: e.target.value })} />
        <Input value={s.fields} onChange={(e) => setS({ ...s, fields: e.target.value })} />
        <Button size="sm" variant="outline" onClick={() => void onSave(m.id, { instructions: s.instructions, required_fields: parse(s.fields) })}>Save</Button>
      </div>
    </Panel>
  );
}
