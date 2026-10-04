import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, getActivePaymentMethods, submitOrder } from "@/lib/client-platform.functions";
import {
  FIELD_LABEL,
  MESSAGING_BASE,
  MESSAGING_CHANNELS,
  MESSAGING_FEATURES,
  MESSAGING_PER_EXTRA_CHANNEL,
  PRODUCTS,
  RECEPTIONIST_CAPABILITIES,
  RECEPTIONIST_CHANNELS,
  type ProductSlug,
} from "@/lib/catalog-v2";
import { useFeatureFlag } from "@/hooks/use-system-settings";

export const Route = createFileRoute("/_authenticated/order/$product")({
  beforeLoad: ({ params }) => {
    if (!(params.product in PRODUCTS)) throw notFound();
  },
  head: () => ({ meta: [{ title: "Order your automation — AntheticPlus" }] }),
  component: OrderPage,
});

const STEPS = ["Identity", "Channel", "Features", "Contact", "Payment", "Submit"];

function OrderPage() {
  const { product } = Route.useParams() as { product: ProductSlug };
  const isRec = product === "ai_receptionist";
  const navigate = useNavigate();
  const storefrontOpen = useFeatureFlag("public_storefront");
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const profile = useQuery({
    queryKey: ["my-profile-v2"],
    queryFn: async () => getMyProfile(),
  });
  const methods = useQuery({
    queryKey: ["payment-methods-active"],
    queryFn: async () => getActivePaymentMethods(),
  });

  const [f, setF] = useState({
    full_name: "",
    company_name: "",
    target: "",
    channel: "hybrid",
    msgChannels: ["whatsapp", "messenger", "telegram"] as string[],
    features: [] as string[],
    email: "",
    country: "",
    methodId: "",
    proof: {} as Record<string, string>,
  });
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setF((s) => ({
      ...s,
      full_name: s.full_name || p.full_name,
      company_name: s.company_name || p.company_name,
      target: s.target || p.website_url,
      email: s.email || p.company_email,
    }));
  }, [profile.data]);
  useEffect(() => {
    setF((s) => ({
      ...s,
      features: (isRec ? RECEPTIONIST_CAPABILITIES : MESSAGING_FEATURES).map((x) => x.key),
    }));
  }, [isRec]);

  const total = useMemo(() => {
    if (isRec) return RECEPTIONIST_CHANNELS.find((c) => c.key === f.channel)?.price ?? 99;
    return MESSAGING_BASE + Math.max(0, f.msgChannels.length - 1) * MESSAGING_PER_EXTRA_CHANNEL;
  }, [isRec, f.channel, f.msgChannels]);
  const method = methods.data?.find((m) => m.id === f.methodId);
  const requiredFields = (method?.required_fields as string[] | undefined) ?? [];

  const valid = [
    f.full_name.trim().length > 1 && f.target.trim().length > 3,
    isRec ? !!f.channel : f.msgChannels.length > 0,
    f.features.length > 0,
    /.+@.+\..+/.test(f.email) && f.country.trim().length > 1,
    !!method && requiredFields.every((k) => (f.proof[k] ?? "").trim().length > 2),
    true,
  ];

  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  async function submit() {
    if (!profile.data) return;
    setSubmitting(true);
    try {
      await submitOrder({ data: {
        product,
        deliveryChannel: isRec ? f.channel : "web",
        features: f.features,
        fullName: f.full_name,
        company: f.company_name,
        email: f.email,
        country: f.country,
        target: f.target,
        plan: "monthly",
        paymentMethodId: f.methodId,
        transactionId: String(f.proof.trx_id ?? f.proof.transaction_id ?? ""),
        senderName: String(f.proof.sender_name ?? f.full_name),
        proof: f.proof,
      } });
      await new Promise((r) => setTimeout(r, 900));
      void confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
      toast.success("Order submitted — we'll verify your payment shortly.");
      setTimeout(() => void navigate({ to: "/dashboard/orders" }), 1400);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit order");
      setSubmitting(false);
    }
  }

  if (!storefrontOpen)
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <h1 className="text-2xl font-bold">New orders are paused</h1>
        <p className="mt-2 text-muted-foreground">Email antheticplusstudios@gmail.com and we'll reserve your spot.</p>
      </div>
    );

  const items = isRec ? RECEPTIONIST_CAPABILITIES : MESSAGING_FEATURES;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">{PRODUCTS[product].name}</h1>
      <p className="text-muted-foreground">{PRODUCTS[product].tagline}</p>

      <ol className="my-8 grid grid-cols-6 gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="text-center text-xs">
            <div
              className={`mx-auto mb-1 grid h-8 w-8 place-items-center rounded-full border text-sm font-bold ${i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden sm:inline">{s}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-border bg-card p-6">
        {step === 0 && (
          <div className="grid gap-4">
            <Field label="Client ID">
              <Input value={profile.data?.client_id ?? "…"} readOnly className="bg-muted" />
            </Field>
            <Field label="Full name">
              <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            </Field>
            <Field label="Company name">
              <Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
            </Field>
            <Field label={isRec ? "Target domain URL" : "Primary business social link or website"}>
              <Input
                placeholder="https://yourbusiness.com"
                value={f.target}
                onChange={(e) => setF({ ...f, target: e.target.value })}
              />
            </Field>
          </div>
        )}

        {step === 1 &&
          (isRec ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {RECEPTIONIST_CHANNELS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setF({ ...f, channel: c.key })}
                  className={`rounded-xl border p-4 text-left ${f.channel === c.key ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
                >
                  {"featured" in c && <Star className="mb-1 h-4 w-4 text-primary" />}
                  <div className="font-bold">{c.label}</div>
                  <div className="mt-2 text-2xl font-extrabold">${c.price}</div>
                  <div className="text-xs text-muted-foreground">per month</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {MESSAGING_CHANNELS.map((c) => (
                <label key={c.key} className="flex items-center gap-3 rounded-xl border border-border p-4">
                  <input
                    type="checkbox"
                    checked={f.msgChannels.includes(c.key)}
                    onChange={() => setF({ ...f, msgChannels: toggle(f.msgChannels, c.key) })}
                  />
                  <span className="font-semibold">{c.label}</span>
                </label>
              ))}
              <p className="text-sm text-muted-foreground">
                ${MESSAGING_BASE}/mo includes one channel, +${MESSAGING_PER_EXTRA_CHANNEL} per extra channel.
              </p>
            </div>
          ))}

        {step === 2 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((c) => (
              <label key={c.key} className="flex gap-3 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={f.features.includes(c.key)}
                  onChange={() => setF({ ...f, features: toggle(f.features, c.key) })}
                />
                <span>
                  <span className="block text-sm font-bold">{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.desc}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <Field label="Email">
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Country">
              <Input placeholder="Bangladesh" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(methods.data ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setF({ ...f, methodId: m.id, proof: {} })}
                  className={`rounded-xl border p-3 text-left font-semibold ${f.methodId === m.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
                >
                  {m.method_name}
                </button>
              ))}
            </div>
            {method && (
              <>
                <p className="rounded-xl bg-muted p-3 text-sm">{method.instructions}</p>
                {requiredFields.map((k) => (
                  <Field key={k} label={FIELD_LABEL[k] ?? k}>
                    <Input
                      value={f.proof[k] ?? ""}
                      onChange={(e) => setF({ ...f, proof: { ...f.proof, [k]: e.target.value } })}
                    />
                  </Field>
                ))}
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-2 text-sm">
            <Row k="Product" v={PRODUCTS[product].name} />
            <Row k="Target" v={f.target} />
            <Row k="Channel" v={isRec ? f.channel : f.msgChannels.join(", ")} />
            <Row k="Features" v={`${f.features.length} selected`} />
            <Row k="Payment" v={method?.method_name ?? ""} />
            <Row k="Total" v={`$${total}/month`} />
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="outline" disabled={step === 0 || submitting} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          {step < 5 ? (
            <Button disabled={!valid[step]} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button disabled={submitting} onClick={submit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Locking in configuration…
                </>
              ) : (
                `Submit order · $${total}`
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
