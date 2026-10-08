import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Loader2,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { draftKey, JOURNEY } from "@/lib/order-journey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAutomation, ENGINE_KIND_BY_SLUG, isAutomationSlug } from "@/lib/automations";
import { SETUP_STEPS, fieldDef } from "@/lib/automation-config";
import { SlideCommit } from "@/components/slide-commit";

import { useCurrentUser, useProfile } from "@/hooks/use-portal";
import { hostFromUrl, paymentMethods } from "@/lib/portal";
import { submitOrder } from "@/lib/client-platform.functions";
import { findPriced, livePricingQueryOptions, useLivePricing, withDiscount } from "@/lib/pricing";
import { validatePromo } from "@/lib/admin.functions";
import { money } from "@/components/admin-ui";
import { AnimatePresence, StepSlide, motion } from "@/components/motion";

export const Route = createFileRoute("/_authenticated/checkout/$slug")({
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const plans = await queryClient.ensureQueryData(livePricingQueryOptions);
    const item = findPriced(slug, plans);
    if (!item || !item.listed) throw notFound();
  },
  validateSearch: (search: Record<string, unknown>) => ({
    plan: search["plan"] === "yearly" ? ("yearly" as const) : ("monthly" as const),
  }),
  head: () => ({
    meta: [
      { title: "Complete Your Order — AntheticPlus Studios" },
      {
        name: "description",
        content: "Configure and submit payment for your AntheticPlus automation.",
      },
      { property: "og:title", content: "AntheticPlus Automation Checkout" },
      {
        property: "og:description",
        content: "Set up your automation and submit manual payment details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Checkout,
});

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

function Checkout() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const item = getAutomation(slug);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: plans } = useLivePricing();
  const priced = findPriced(slug, plans);
  const kind = isAutomationSlug(slug) ? ENGINE_KIND_BY_SLUG[slug] : null;
  // Product-specific configuration steps; their answers become the deployment configuration.
  const prodSteps = kind ? SETUP_STEPS[kind].slice(1) : [];
  const steps = [
    "Company",
    "Business profile",
    ...prodSteps.map((p) => p.label),
    "Plan",
    "Payment",
  ];
  const last = steps.length;
  const [config, setConfig] = useState<Record<string, string>>({});

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [plan, setPlan] = useState<"monthly" | "yearly">(search.plan);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoPct, setPromoPct] = useState<number | null>(null);
  const [promoNote, setPromoNote] = useState("");
  const [promoOk, setPromoOk] = useState(false);
  const [promoBusy, setPromoBusy] = useState(false);
  const [form, setForm] = useState({
    company: "",
    email: "",
    website: "",
    category: "",
    context: "",
    instructions: "",
    method: paymentMethods[1] as string,
    transaction: "",
    sender: "",
  });

  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      company: f.company || profile.company_name,
      email: f.email || profile.company_email,
      website: f.website || profile.website_url,
      category: f.category || profile.category,
    }));
  }, [profile]);

  // Resume an incomplete order after refresh / return (drafts never include payment proof).
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey(slug));
      if (raw) {
        const d = JSON.parse(raw) as {
          form?: Partial<typeof form>;
          config?: Record<string, string>;
          step?: number;
        };
        if (d.form) setForm((f) => ({ ...f, ...d.form, transaction: "", sender: "" }));
        if (d.config) setConfig(d.config);
        if (d.step && d.step > 1) setStep(d.step);
      }
    } catch {
      /* ignore corrupt drafts */
    }
    setDraftLoaded(true);
  }, [slug]);
  useEffect(() => {
    if (!draftLoaded || done) return;
    const { transaction: _t, sender: _s, ...rest } = form;
    sessionStorage.setItem(draftKey(slug), JSON.stringify({ form: rest, config, step }));
  }, [draftLoaded, done, form, config, step, slug]);
  const submittingRef = useRef(false);

  if (!item) return <div className="p-8">Automation not found.</div>;

  const monthlyBase = priced?.price ?? item.price;
  const discountPct = priced?.yearlyDiscountPct ?? 20;
  const recurringAmount =
    plan === "yearly"
      ? (priced?.yearlyPrice ?? Math.round(monthlyBase * (1 - discountPct / 100)) * 12)
      : monthlyBase;
  const setupFee = priced?.setupFee ?? monthlyBase;
  const { amount: total, saved } = withDiscount(setupFee, promoPct);
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const domain = hostFromUrl(form.website);

  const applyPromo = async () => {
    const code = promo.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoNote("");
    try {
      const percent = await validatePromo({ data: { code } });
      if (percent && percent > 0) {
        setPromoPct(percent);
        setPromoOk(true);
        setPromoNote(`Promo applied — ${percent}% off this order.`);
      } else {
        setPromoPct(null);
        setPromoOk(false);
        setPromoNote("That promo code isn't active. Check the code and try again.");
      }
    } catch {
      setPromoPct(null);
      setPromoOk(false);
      setPromoNote("That promo code isn't active. Check the code and try again.");
    } finally {
      setPromoBusy(false);
    }
  };

  if (!profileLoading && !profile?.profile_completed) {
    return (
      <div className="mx-auto max-w-lg p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-foreground/40 bg-card p-8 text-center shadow-xl"
        >
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-foreground/15">
            <TriangleAlert className="h-6 w-6 text-foreground" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold">Complete your profile first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We lock every automation to one domain, so we need your company details before checkout.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/dashboard/profile">Complete profile</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  const submit = async () => {
    if (submittingRef.current) return; // duplicate-submission guard (double slide / double tap)
    submittingRef.current = true;
    setBusy(true);
    setError("");
    if (!user) {
      setError("Your session expired. Please sign in again.");
      setBusy(false);
      return;
    }
    if (!domain) {
      setError("Add a valid website address before submitting.");
      setBusy(false);
      return;
    }
    try {
      const method = await import("@/lib/client-platform.functions").then(
        ({ getActivePaymentMethods }) => getActivePaymentMethods(),
      );
      const selected = method.find((m) => m.method_name === form.method);
      if (!selected) throw new Error("Selected payment method is unavailable.");
      await submitOrder({
        data: {
          product: kind!,
          configuration: {
            ...config,
            business_info: form.context.trim(),
            system_prompt: config["system_prompt"] || form.instructions.trim(),
          },
          deliveryChannel: "web",
          features: [form.context.slice(0, 500), form.instructions.slice(0, 500)].filter(Boolean),
          fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "Customer",
          company: form.company,
          email: form.email,
          country: "Unspecified",
          target: form.website,
          plan,
          paymentMethodId: selected.id,
          transactionId: form.transaction.trim(),
          senderName: form.sender.trim(),
          proof: { transaction_id: form.transaction.trim(), sender_name: form.sender.trim() },
          promoCode: promoOk ? promo.trim().toUpperCase() : undefined,
        },
      });
      sessionStorage.removeItem(draftKey(slug));
      setDone(true);
      await queryClient.invalidateQueries();
      setTimeout(() => void navigate({ to: "/dashboard/payments" }), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your order. Please try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const step1Ok =
    !!form.company.trim() && emailOk(form.email) && !!domain && !!form.category.trim();
  const step2Ok = form.context.trim().length > 20;
  const prodStep = step > 2 && step < last - 1 ? prodSteps[step - 3] : null;
  const prodOk = !prodStep || prodStep.fields.every((f) => (config[f] ?? "").trim().length > 0);
  const canContinue = step === 1 ? step1Ok : step === 2 ? step2Ok : prodOk;
  const canSubmit = !!form.transaction.trim() && !!form.sender.trim();

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setTouched(false);
    setStep(next);
  };

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="max-w-md rounded-3xl border border-border bg-card p-10 text-center shadow-2xl"
        >
          <motion.div
            initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ delay: 0.12, type: "spring", stiffness: 260, damping: 16 }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-primary/12"
          >
            <CircleCheckBig className="h-8 w-8 text-primary" />
          </motion.div>
          <h1 className="mt-6 text-2xl font-extrabold">Order received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We're verifying your payment for {item.name}. You'll see the status update on your
            payments page in a moment.
          </p>
        </motion.div>
      </div>
    );
  }

  const fields =
    step === 1 ? (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Company name"
          value={form.company}
          onChange={(v) => set("company", v)}
          required={touched}
        />
        <Field
          label="Contact email"
          type="email"
          value={form.email}
          onChange={(v) => set("email", v)}
          invalid={touched && !emailOk(form.email)}
          hint={touched && !emailOk(form.email) ? "Enter a valid email address" : undefined}
        />
        <Field
          label="Target website"
          value={form.website}
          onChange={(v) => set("website", v)}
          invalid={touched && !domain}
          hint={touched && !domain ? "Example: yourbusiness.com" : undefined}
        />
        <Field
          label="Business category"
          value={form.category}
          onChange={(v) => set("category", v)}
          required={touched}
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
          <Lock className="h-3.5 w-3.5" />
          Your automation will be locked to <strong>{domain || "your domain"}</strong>.
        </p>
      </div>
    ) : step === 2 ? (
      <div className="space-y-4">
        <div>
          <Label>Business context</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste everything your AI should know: services, hours, pricing, policies, tone.
          </p>
          <Textarea
            value={form.context}
            onChange={(e) => set("context", e.target.value)}
            placeholder="We are a family dental clinic in Dhaka, open 9-5 Sunday to Thursday. We offer cleanings, whitening and emergency care…"
            className="mt-2 min-h-56 rounded-xl"
          />
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${Math.min(100, (form.context.trim().length / 200) * 100)}%` }}
                transition={{ duration: 0.4, ease: [0.22, 0.9, 0.2, 1] }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{form.context.trim().length} characters</p>
          </div>
        </div>
        <div>
          <Label>Specific AI instructions (optional)</Label>
          <Textarea
            value={form.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            placeholder="Be warm and concise. Escalate urgent cases to the on-call team."
            className="mt-2 min-h-28 rounded-xl"
          />
        </div>
      </div>
    ) : prodStep && kind ? (
      <div className="grid gap-4">
        {[...prodStep.fields, ...(prodStep.optional ?? [])].map((key) => {
          const f = fieldDef(kind, key);
          const required = prodStep.fields.includes(key);
          return (
            <div key={key}>
              <Label>
                {f.label}
                {!required && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                )}
              </Label>
              {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
              {f.long ? (
                <Textarea
                  className="mt-2 min-h-28 rounded-xl"
                  value={config[key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                />
              ) : (
                <Input
                  className="mt-2"
                  type={f.kind === "number" ? "number" : "text"}
                  value={config[key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                />
              )}
              {required && touched && !(config[key] ?? "").trim() && (
                <p className="mt-1 text-xs text-destructive">Required</p>
              )}
            </div>
          );
        })}
      </div>
    ) : step === last - 1 ? (
      <div className="grid gap-4 sm:grid-cols-2">
        {(["monthly", "yearly"] as const).map((p) => {
          const perMonth =
            p === "yearly" ? Math.round(monthlyBase * (1 - discountPct / 100)) : monthlyBase;
          return (
            <motion.button
              type="button"
              key={p}
              onClick={() => setPlan(p)}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className={`relative overflow-hidden rounded-3xl border p-6 text-left ${plan === p ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/30"}`}
            >
              <span className="flex items-center justify-between font-extrabold capitalize">
                {p}
                {plan === p && <CircleCheckBig className="text-primary" />}
              </span>
              <span className="mt-4 block text-3xl font-extrabold">
                {money(perMonth)}
                <small className="text-sm font-medium text-muted-foreground">/mo</small>
              </span>
              {p === "yearly" && (
                <span className="mt-2 block text-sm font-bold text-primary">
                  Save {discountPct}% · {money(perMonth * 12)} billed after 1 year
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    ) : (
      <div>
        <div className="rounded-3xl bg-secondary p-5">
          <p className="font-extrabold">Transfer instructions</p>
          <p className="mt-2 text-sm leading-6 text-secondary-foreground">
            Pay only the one-time setup fee today. Your selected recurring plan begins after setup,
            and the next subscription payment is due after the first billing period.
          </p>
          <p className="mt-3 text-2xl font-extrabold">{money(total)} USD</p>
        </div>
        <div className="mt-5">
          <Label>Payment method</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {paymentMethods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("method", m)}
                className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${form.method === m ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Transaction ID / Ref"
            value={form.transaction}
            onChange={(v) => set("transaction", v)}
            required={touched}
          />
          <Field
            label="Sender name"
            value={form.sender}
            onChange={(v) => set("sender", v)}
            required={touched}
          />
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/automations/$slug"
          params={{ slug }}
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to details
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 0.9, 0.2, 1] }}
            className="rounded-3xl border border-border bg-card p-5 shadow-xl sm:p-8"
          >
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${last}, minmax(0, 1fr))` }}
            >
              {steps.map((label, i) => (
                <div key={label}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={false}
                      animate={{ width: i + 1 <= step ? "100%" : "0%" }}
                      transition={{ duration: 0.45, ease: [0.22, 0.9, 0.2, 1] }}
                    />
                  </div>
                  <p
                    className={`mt-2 hidden text-xs font-bold sm:block ${i + 1 === step ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {i + 1}. {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 min-h-[320px]">
              <StepSlide stepKey={step} direction={direction}>
                <h2 className="mb-6 text-xl font-extrabold">{steps[step - 1]}</h2>
                {fields}
              </StepSlide>
              <AnimatePresence initial={false}>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
              <Button variant="ghost" disabled={step === 1 || busy} onClick={() => go(step - 1)}>
                <ChevronLeft />
                Back
              </Button>
              {step < last ? (
                <Button
                  onClick={() => {
                    if (!canContinue) {
                      setTouched(true);
                      return;
                    }
                    go(step + 1);
                  }}
                  className={canContinue ? "" : "opacity-60"}
                >
                  Continue
                  <ChevronRight />
                </Button>
              ) : (
                <div className="w-full max-w-xs">
                  <SlideCommit
                    label="Slide to submit for verification"
                    busy={busy}
                    disabled={!canSubmit}
                    onCommit={() => void submit()}
                  />
                  <ol
                    aria-label="What happens next"
                    className="mt-3 flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground"
                  >
                    {JOURNEY.map((j, i) => (
                      <li key={j.key} className={i === 0 ? "font-semibold text-foreground" : ""}>
                        {j.label}
                        {i < JOURNEY.length - 1 && <span aria-hidden> →</span>}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    Sliding submits your payment details only. A person on our team verifies the
                    payment before setup begins.
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 0.9, 0.2, 1] }}
            className="h-fit rounded-3xl border border-border bg-card p-6 shadow-xl lg:sticky lg:top-6"
          >
            <p className="text-sm font-bold text-primary">Order summary</p>
            <h2 className="mt-1 text-lg font-extrabold leading-snug">{item.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground capitalize">{plan} billing</p>

            <div className="mt-5 space-y-2.5 text-sm">
              <Row label="One-time setup fee" value={money(setupFee)} />
              <Row
                label={
                  plan === "yearly"
                    ? "Yearly plan — next payment in 1 year"
                    : "Monthly plan — next payment in 30 days"
                }
                value={money(recurringAmount)}
              />
              {promoPct ? (
                <Row label={`Promo (${promoPct}% off)`} value={`− ${money(saved)}`} accent />
              ) : null}
              <div className="my-3 h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="font-bold">Total due now</span>
                <motion.span
                  key={total}
                  initial={{ scale: 0.9, opacity: 0.4 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl font-extrabold"
                >
                  {money(total)}
                </motion.span>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Today you pay only the one-time setup fee. The recurring {plan} plan is scheduled for
              its first payment after {plan === "yearly" ? "1 year" : "30 days"}.
            </p>

            <div className="mt-5">
              <Label className="text-xs">Promo code</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="h-10 rounded-xl"
                />
                <Button
                  variant="outline"
                  onClick={applyPromo}
                  disabled={promoBusy || !promo.trim()}
                >
                  {promoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {promoNote && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mt-2 text-xs font-semibold ${promoOk ? "text-primary" : "text-destructive"}`}
                  >
                    {promoNote}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <ul className="mt-6 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                Every payment is reviewed by a human before anything goes live.
              </li>
              <li className="flex gap-2">
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                Locked to one domain — {domain || "your website"}.
              </li>
              <li className="flex gap-2">
                <Lock className="h-4 w-4 shrink-0 text-primary" />
                No card details are stored anywhere on this site.
              </li>
            </ul>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-bold text-primary" : "font-bold"}>{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  invalid,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string | undefined;
  invalid?: boolean | undefined;
  hint?: string | undefined;
  required?: boolean | undefined;
}) {
  const bad = invalid || (required && !value.trim());
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-2 h-12 rounded-xl ${bad ? "border-destructive focus-visible:ring-destructive/40" : ""}`}
      />
      {hint && <p className="mt-1.5 text-xs text-destructive">{hint}</p>}
      {!hint && bad && <p className="mt-1.5 text-xs text-destructive">This field is required</p>}
    </div>
  );
}
