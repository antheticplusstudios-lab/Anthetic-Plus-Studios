import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, Panel, StatusPill } from "@/components/admin-ui";
import { WidgetCustomizer } from "@/components/widget-customizer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { adminListAutomations, adminUpdateAutomation } from "@/lib/admin-data.functions";
import { AUTOMATION_LABEL } from "@/lib/catalog-v2";

export const Route = createFileRoute("/_authenticated/admin/receptionist")({
  head: () => ({ meta: [{ title: "Live Automations — AntheticPlus" }] }),
  component: ReceptionistAdmin,
});

function ReceptionistAdmin() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin-ca"],
    queryFn: async () => {
      return adminListAutomations();
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-ca"] });
  const rows = (list.data ?? []).filter(
    (a) =>
      !q || `${a.client_id} ${a.order_id} ${a.domain_url}`.toLowerCase().includes(q.toLowerCase()),
  );
  const current = list.data?.find((a) => a.id === sel);

  async function update(id: string, patch: Record<string, unknown>) {
    try {
      await adminUpdateAutomation({ data: { automationId: id, patch } });
      toast.success("Saved");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <AdminPage
      title="Live Automations"
      subtitle="Assign phone numbers, pause clients and customize each widget."
    >
      <Input
        className="mb-4 max-w-sm"
        placeholder="Search client ID, order ID or domain"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid gap-3">
        {rows.map((a) => (
          <AutomationRow
            key={a.id}
            a={a}
            selected={sel === a.id}
            onSelect={() => setSel(sel === a.id ? null : a.id)}
            onUpdate={update}
          />
        ))}
        {list.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No live automations yet. Approve an order to create one.
          </p>
        )}
      </div>
      {current && (
        <Panel title={`Widget — ${current.client_id}`} className="mt-6">
          <WidgetCustomizer
            automationId={current.id}
            initial={current.widget_config}
            onSaved={refresh}
          />
        </Panel>
      )}
    </AdminPage>
  );
}

type Row = {
  id: string;
  client_id: string;
  order_id: string | null;
  automation_type: string;
  domain_url: string;
  assigned_phone_number: string | null;
  is_active: boolean;
  requires_reinstallation: boolean;
};

function AutomationRow({
  a,
  selected,
  onSelect,
  onUpdate,
}: {
  a: Row;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, p: Record<string, unknown>) => Promise<unknown>;
}) {
  const [phone, setPhone] = useState(a.assigned_phone_number ?? "");
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 ${selected ? "border-primary" : "border-border"}`}
    >
      <div className="min-w-56 flex-1">
        <div className="font-bold">
          {a.client_id} <span className="text-xs text-muted-foreground">{a.order_id}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {AUTOMATION_LABEL[a.automation_type]} · {a.domain_url}
        </div>
      </div>
      {a.requires_reinstallation && <StatusPill status="needs reinstall" />}
      <Input
        className="w-44"
        placeholder="+1 555 000 0000"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!/^\+?[\d\s()-]{7,}$/.test(phone) && phone !== ""}
        onClick={() => void onUpdate(a.id, { assigned_phone_number: phone.trim() || null })}
      >
        Save number
      </Button>
      <label className="flex items-center gap-2 text-sm">
        Active{" "}
        <Switch
          checked={a.is_active}
          onCheckedChange={(v) => void onUpdate(a.id, { is_active: v })}
        />
      </label>
      <Button size="sm" onClick={onSelect}>
        {selected ? "Close" : "Customize widget"}
      </Button>
    </div>
  );
}
