import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
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

const topicLabel: Record<(typeof CONTACT_TOPICS)[number], string> = {
  sales: "Sales & automations",
  support: "Technical support",
  partnership: "Partnership",
  billing: "Billing & payments",
  other: "Something else",
};

function ContactPage() {
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
      setResult({ status: "failed", message: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-14 md:grid-cols-[1fr_1.4fr]">
        <section>
          <h1 className="text-3xl font-extrabold tracking-tight">Let's talk</h1>
          <p className="mt-3 text-muted-foreground">
            Questions about an automation, your account, or working together? Send us a message and
            we'll reply by email.
          </p>
          <a
            href="mailto:antheticplusstudios@gmail.com"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
          >
            <Mail className="h-4 w-4" /> antheticplusstudios@gmail.com
          </a>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {result?.status === "sent" ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <h2 className="mt-3 text-xl font-bold">Message sent</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Thanks — we'll get back to you by email.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldBox id="name" label="Name" error={errors.name}>
                  <Input id="name" value={form.name} onChange={set("name")} autoComplete="name" />
                </FieldBox>
                <FieldBox id="email" label="Email" error={errors.email}>
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
                <FieldBox id="company" label="Company (optional)" error={errors.company}>
                  <Input
                    id="company"
                    value={form.company}
                    onChange={set("company")}
                    autoComplete="organization"
                  />
                </FieldBox>
                <FieldBox id="topic" label="Topic" error={errors.topic}>
                  <select
                    id="topic"
                    value={form.topic}
                    onChange={set("topic")}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CONTACT_TOPICS.map((t) => (
                      <option key={t} value={t}>
                        {topicLabel[t]}
                      </option>
                    ))}
                  </select>
                </FieldBox>
              </div>
              <FieldBox id="message" label="Message" error={errors.message}>
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
                {busy ? "Sending…" : "Send message"}
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
