import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, Panel } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminDeletePaymentMethod,
  adminListPaymentMethods,
  adminSavePaymentMethod,
} from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Admin Payment Methods in the Autumic AI automation platform.",
      },
      { property: "og:title", content: "Admin Payment Methods — Autumic" },
      {
        property: "og:description",
        content: "Admin Payment Methods in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Payment Methods — Autumic" },
    ],
  }),
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
  const [n, setN] = useState({
    method_name: "",
    provider_name: "Manual",
    account_identifier: "",
    instructions: "",
    fields: "sender_phone, trx_id",
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-pm"] });
    void qc.invalidateQueries({ queryKey: ["payment-methods-active"] });
  };
  const parse = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  async function save(id: string, patch: Record<string, unknown>) {
    const current = (list.data ?? []).find((x) => x.id === id);
    try {
      await adminSavePaymentMethod({
        data: {
          id,
          method_name: String(patch["method_name"] ?? current?.method_name ?? "Payment method"),
          provider_name: String(patch["provider_name"] ?? current?.provider_name ?? "Manual"),
          account_identifier: String(
            patch["account_identifier"] ?? current?.account_identifier ?? "",
          ),
          instructions: String(patch["instructions"] ?? current?.instructions ?? ""),
          required_fields: (patch["required_fields"] as string[]) ?? current?.required_fields ?? [],
          is_active: Boolean(patch["is_active"] ?? current?.is_active ?? true),
        },
      });
      toast.success("Saved");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }
  async function add() {
    try {
      await adminSavePaymentMethod({
        data: {
          id: null,
          method_name: n.method_name,
          provider_name: n.provider_name,
          account_identifier: n.account_identifier,
          instructions: n.instructions,
          required_fields: parse(n.fields),
          is_active: true,
        },
      });
      setN({
        method_name: "",
        provider_name: "Manual",
        account_identifier: "",
        instructions: "",
        fields: "sender_phone, trx_id",
      });
      toast.success("Payment method added");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    }
  }
  async function remove(id: string, name: string) {
    if (!window.confirm("Remove " + name + " from checkout?")) return;
    try {
      const result = await adminDeletePaymentMethod({ data: { id } });
      toast.success(
        result.archived
          ? "Method has payment history, so it was safely disabled."
          : "Payment method deleted",
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <AdminPage
      title="Payment Methods"
      subtitle="What customers see at the payment step of checkout."
    >
      <div className="grid gap-4">
        {(list.data ?? []).map((m) => (
          <MethodCard
            key={m.id}
            m={m}
            onSave={save}
            parse={parse}
            onDelete={() => void remove(m.id, m.method_name)}
          />
        ))}
        <Panel title="Add a payment method">
          <div className="grid gap-3">
            <Input
              placeholder="Name, e.g. Rocket"
              value={n.method_name}
              onChange={(e) => setN({ ...n, method_name: e.target.value })}
            />
            <Input
              placeholder="Provider / bank name"
              value={n.provider_name}
              onChange={(e) => setN({ ...n, provider_name: e.target.value })}
            />
            <Input
              placeholder="Account number, wallet address or payment destination"
              value={n.account_identifier}
              onChange={(e) => setN({ ...n, account_identifier: e.target.value })}
            />
            <Textarea
              placeholder="Instructions shown to the customer"
              value={n.instructions}
              onChange={(e) => setN({ ...n, instructions: e.target.value })}
            />
            <Input
              placeholder="Required fields, comma separated"
              value={n.fields}
              onChange={(e) => setN({ ...n, fields: e.target.value })}
            />
            <Button disabled={!n.method_name || !n.instructions} onClick={() => void add()}>
              Add
            </Button>
          </div>
        </Panel>
      </div>
    </AdminPage>
  );
}

type M = {
  id: string;
  method_name: string;
  instructions: string;
  required_fields: unknown;
  is_active: boolean;
  is_card: boolean;
  provider_name?: string | null;
  account_identifier?: string | null;
};
function MethodCard({
  m,
  onSave,
  parse,
  onDelete,
}: {
  m: M;
  onSave: (id: string, p: Record<string, unknown>) => Promise<unknown>;
  parse: (s: string) => string[];
  onDelete: () => void;
}) {
  const [s, setS] = useState({
    method_name: m.method_name,
    provider_name: m.provider_name ?? "Manual",
    account_identifier: m.account_identifier ?? "",
    instructions: m.instructions,
    fields: ((m.required_fields as string[]) ?? []).join(", "),
  });
  return (
    <Panel
      title={m.method_name}
      description={m.is_card ? "Card payments go live once Stripe/PayPal is connected." : undefined}
      actions={
        <Switch
          checked={m.is_active}
          disabled={m.is_card}
          onCheckedChange={(v) => void onSave(m.id, { is_active: v })}
        />
      }
    >
      <div className="grid gap-2">
        <Input
          aria-label="Payment method name"
          value={s.method_name}
          onChange={(e) => setS({ ...s, method_name: e.target.value })}
        />
        <Input
          aria-label="Provider / bank name"
          value={s.provider_name}
          onChange={(e) => setS({ ...s, provider_name: e.target.value })}
        />
        <Input
          aria-label="Payment destination"
          value={s.account_identifier}
          onChange={(e) => setS({ ...s, account_identifier: e.target.value })}
        />
        <Textarea
          value={s.instructions}
          onChange={(e) => setS({ ...s, instructions: e.target.value })}
        />
        <Input value={s.fields} onChange={(e) => setS({ ...s, fields: e.target.value })} />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void onSave(m.id, {
              method_name: s.method_name,
              provider_name: s.provider_name,
              account_identifier: s.account_identifier,
              instructions: s.instructions,
              required_fields: parse(s.fields),
            })
          }
        >
          Save changes
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          Delete method
        </Button>
      </div>
    </Panel>
  );
}
