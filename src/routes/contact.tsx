import { useT } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, Mail, Send, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero3D } from "@/components/hero-3d";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CONTACT_TOPICS, contactSchema } from "@/lib/contact-schema";
import { submitContact, type ContactResult } from "@/lib/contact.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — AntheticPlus Studios" },
      {
        name: "description",
        content:
          "Talk to AntheticPlus Studios about AI automations, support, billing or partnerships.",
      },
      { property: "og:title", content: "Contact — AntheticPlus Studios" },
      {
        property: "og:description",
        content:
          "Talk to AntheticPlus Studios about AI automations, support, billing or partnerships.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

const topicLabel: Record<(typeof CONTACT_TOPICS)[number], readonly [string, string]> = {
  sales: ["Sales & automations", "বিক্রয় ও অটোমেশন"],
  support: ["Technical support", "প্রযুক্তিগত সহায়তা"],
  partnership: ["Partnership", "অংশীদারিত্ব"],
  billing: ["Billing & payments", "বিলিং ও পেমেন্ট"],
  other: ["Something else", "অন্য বিষয়"],
};

function ContactPage() {
  const t = useT();
  const send = useServerFn(submitContact);
  const startedAt = useMemo(() => Date.now(), []);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    topic: "sales",
    message: "",
    website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContactResult | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = contactSchema.safeParse({ ...form, startedAt });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setResult(await send({ data: parsed.data }));
    } catch {
      setResult({
        status: "failed",
        message: t(
          "Something went wrong. Please try again.",
          "কিছু সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-14 md:grid-cols-[1fr_1.4fr]">
        <section className="relative">
          <Hero3D />
          <h1 className="relative text-4xl font-extrabold tracking-tight md:text-5xl">
            {t("Let's talk", "আসুন কথা বলি")}
          </h1>
          <p className="relative mt-3 text-muted-foreground">
            {t(
              "Questions about an automation, your account, or working together? Send us a message and we'll reply by email.",
              "অটোমেশন, আপনার অ্যাকাউন্ট বা একসঙ্গে কাজ করা নিয়ে প্রশ্ন আছে? আমাদের বার্তা পাঠান, আমরা ইমেইলে উত্তর দেব।",
            )}
          </p>
          <ul className="relative mt-8 space-y-4">
            {[
              {
                icon: Clock,
                title: t("Reply within 1 business day", "১ কর্মদিবসের মধ্যে উত্তর"),
                body: t(
                  "A real person reads every message.",
                  "প্রতিটি বার্তা আমাদের একজন কর্মী পড়েন।",
                ),
              },
              {
                icon: Sparkles,
                title: t("Free automation advice", "বিনামূল্যে অটোমেশন পরামর্শ"),
                body: t(
                  "Tell us where leads slip — we'll suggest the smallest fix.",
                  "কোথায় সম্ভাব্য গ্রাহক হারাচ্ছেন জানান—আমরা ন্যূনতম প্রয়োজনীয় সমাধান দেব।",
                ),
              },
              {
                icon: ShieldCheck,
                title: t("Private by default", "গোপনীয়তা নিশ্চিত"),
                body: t(
                  "Your details are only used to answer you.",
                  "আপনার তথ্য শুধু আপনাকে উত্তর দেওয়ার জন্য ব্যবহার করা হয়।",
                ),
              },
            ].map((i) => (
              <li key={i.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <i.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold">{i.title}</div>
                  <div className="text-sm text-muted-foreground">{i.body}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" /> antheticplusstudios@gmail.com
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {result?.status === "sent" ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <h2 className="mt-3 text-xl font-bold">
                {t("Message sent", "বার্তা পাঠানো হয়েছে")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "Thanks — we'll get back to you by email.",
                  "ধন্যবাদ—আমরা ইমেইলে আপনার সঙ্গে যোগাযোগ করব।",
                )}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldBox id="name" label={t("Name", "নাম")} error={errors["name"]}>
                  <Input id="name" value={form.name} onChange={set("name")} autoComplete="name" />
                </FieldBox>
                <FieldBox id="email" label={t("Email", "ইমেইল")} error={errors["email"]}>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    autoComplete="email"
                  />
                </FieldBox>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldBox
                  id="company"
                  label={t("Company (optional)", "প্রতিষ্ঠান (ঐচ্ছিক)")}
                  error={errors["company"]}
                >
                  <Input
                    id="company"
                    value={form.company}
                    onChange={set("company")}
                    autoComplete="organization"
                  />
                </FieldBox>
                <FieldBox id="topic" label={t("Topic", "বিষয়")} error={errors["topic"]}>
                  <select
                    id="topic"
                    value={form.topic}
                    onChange={set("topic")}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CONTACT_TOPICS.map((topic) => (
                      <option key={topic} value={topic}>
                        {t(...topicLabel[topic])}
                      </option>
                    ))}
                  </select>
                </FieldBox>
              </div>
              <FieldBox id="message" label={t("Message", "বার্তা")} error={errors["message"]}>
                <Textarea id="message" rows={6} value={form.message} onChange={set("message")} />
              </FieldBox>
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                value={form.website}
                onChange={set("website")}
                name="website"
              />
              {result?.status === "not_configured" && (
                <p className="rounded-md bg-muted p-3 text-sm">
                  Online messages aren't connected yet. Please email us directly at{" "}
                  <a className="font-semibold text-primary" href={`mailto:${result.inbox}`}>
                    {result.inbox}
                  </a>
                  .
                </p>
              )}
              {result?.status === "failed" && (
                <p className="text-sm text-destructive">{result.message}</p>
              )}
              <Button type="submit" disabled={busy} className="w-full rounded-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {busy ? t("Sending…", "পাঠানো হচ্ছে…") : t("Send message", "বার্তা পাঠান")}
              </Button>
            </form>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function FieldBox({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
