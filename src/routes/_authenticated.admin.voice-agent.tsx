import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, Mail, Save, ShieldCheck, Sparkles, TestTube2 } from "lucide-react";
import { AdminPage, AreaField, Field, Loading, Panel, TextField } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useRole } from "@/hooks/use-portal";
import {
  clearVoiceAgentGroqKey,
  getVoiceAgentSettings,
  saveVoiceAgentEmail,
  saveVoiceAgentGroqKey,
  saveVoiceAgentSettings,
  testVoiceAgent,
  testVoiceAgentEmail,
  type VoiceAgentSettings,
  type VoiceEmailType,
} from "@/lib/voice-agent.functions";

export const Route = createFileRoute("/_authenticated/admin/voice-agent")({
  head: () => ({ meta: [{ title: "AI Voice Agent — AntheticPlus Control Center" }] }),
  component: VoiceAgentAdminPage,
});

const emailLabels: Record<VoiceEmailType, string> = {
  renewal: "Renewal summary",
  verification: "Verification status",
  order_confirmation: "Order confirmation",
  automation_status: "Automation status",
  account_summary: "Account summary",
  account_update: "Account update",
  announcement: "Announcement",
};

const emailOrder = Object.keys(emailLabels) as VoiceEmailType[];

function VoiceAgentAdminPage() {
  const qc = useQueryClient();
  const { data: role } = useRole();
  const getSettings = useServerFn(getVoiceAgentSettings);
  const saveSettings = useServerFn(saveVoiceAgentSettings);
  const saveGroq = useServerFn(saveVoiceAgentGroqKey);
  const clearGroq = useServerFn(clearVoiceAgentGroqKey);
  const saveEmail = useServerFn(saveVoiceAgentEmail);
  const testEmail = useServerFn(testVoiceAgentEmail);
  const testAi = useServerFn(testVoiceAgent);

  const { data, isLoading, error } = useQuery({
    queryKey: ["voice-agent-settings"],
    queryFn: () => getSettings(),
  });

  const [settings, setSettings] = useState<VoiceAgentSettings | null>(null);
  const [groqKey, setGroqKey] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [testQuestion, setTestQuestion] = useState("What does AntheticPlus offer?");
  const [testAnswer, setTestAnswer] = useState("");
  const [testAccountContext, setTestAccountContext] = useState(false);
  const [emailTemplateType, setEmailTemplateType] = useState<VoiceEmailType>("renewal");

  useEffect(() => {
    if (!data) return;
    setSettings(data.settings);
  }, [data]);

  const emailTemplate = useMemo(
    () => settings?.emailTemplates[emailTemplateType] ?? { subject: "", body: "" },
    [settings, emailTemplateType],
  );

  const update = <K extends keyof VoiceAgentSettings>(key: K, value: VoiceAgentSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  };

  const settingsMutation = useMutation({
    mutationFn: () => {
      if (!settings) throw new Error("Settings are not loaded.");
      return saveSettings({ data: settings });
    },
    onSuccess: (next) => {
      setSettings(next.settings);
      toast.success("AI Voice Agent settings saved");
      void qc.invalidateQueries({ queryKey: ["voice-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groqMutation = useMutation({
    mutationFn: () => saveGroq({ data: { keyValue: groqKey } }),
    onSuccess: (result) => {
      setGroqKey("");
      toast.success(`Dedicated Groq key saved (${result.hint})`);
      void qc.invalidateQueries({ queryKey: ["voice-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearGroqMutation = useMutation({
    mutationFn: () => clearGroq(),
    onSuccess: () => {
      toast.success("Dedicated Groq key cleared");
      void qc.invalidateQueries({ queryKey: ["voice-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailMutation = useMutation({
    mutationFn: () => saveEmail({
      data: {
        enabled: settings?.emailEnabled ?? false,
        provider: settings?.emailProvider ?? "none",
        apiKey: resendKey || undefined,
        fromName: settings?.emailFromName ?? "AntheticPlus Studios",
        fromEmail: settings?.emailFromAddress ?? "",
        replyTo: settings?.emailReplyTo ?? "",
      },
    }),
    onSuccess: (result) => {
      setResendKey("");
      toast.success(result.configured ? "Email channel saved" : "Email settings saved");
      void qc.invalidateQueries({ queryKey: ["voice-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testEmailMutation = useMutation({
    mutationFn: () => testEmail(),
    onSuccess: () => toast.success("Test email sent to your signed-in admin email"),
    onError: (e: Error) => toast.error(e.message),
  });

  const testAiMutation = useMutation({
    mutationFn: () => testAi({ data: { question: testQuestion, includeAccountContext: testAccountContext } }),
    onSuccess: (result) => setTestAnswer(`${result.answer}  ·  ${result.provider}/${result.model}`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !settings) return <Loading label="Loading AI Voice Agent settings" />;
  if (error) return <p className="text-sm text-destructive">Could not load Voice Agent settings: {(error as Error).message}</p>;

  const isOwner = role === "owner";

  return (
    <AdminPage
      title="AI Voice Agent"
      subtitle="Control the homepage AI receptionist, its approved context, its account-data boundary, voice behavior and the server-side email channel."
      actions={
        <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
          {settingsMutation.isPending ? <Save className="animate-pulse" /> : <Save />}
          Save all settings
        </Button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-6">
          <Panel title="Runtime controls" description="These switches affect the public homepage assistant without changing auth, RLS or the four-database boundaries.">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["enabled", "Homepage agent enabled", "Show and answer from the homepage assistant."],
                ["voiceEnabled", "Voice mode enabled", "Allow microphone input and browser speech output."],
                ["accountContextEnabled", "Authenticated account context", "Allow signed-in users to ask about their own approved account data."],
                ["emailActionsEnabled", "Email actions enabled", "Allow account email suggestions and confirmed sends."],
                ["requireEmailConfirmation", "Require email confirmation", "Require the customer to confirm before an assistant-requested email is sent. Only an owner may disable this safeguard."],
              ].map(([key, label, description]) => (
                <label key={key} className="flex items-start gap-3 rounded-2xl border border-border p-4">
                  <Switch checked={Boolean(settings[key as keyof VoiceAgentSettings])} onCheckedChange={(value) => update(key as keyof VoiceAgentSettings, value as never)} />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field label="Inactivity timeout" hint="The public default is 60 seconds. Range is guarded server-side.">
                <TextField type="number" min={30} max={180} value={settings.inactivitySeconds} onChange={(e) => update("inactivitySeconds", Number(e.target.value))} />
              </Field>
              <Field label="Model">
                <TextField value={settings.model} onChange={(e) => update("model", e.target.value)} />
              </Field>
              <Field label="Max tokens">
                <TextField type="number" min={300} max={2400} value={settings.maxTokens} onChange={(e) => update("maxTokens", Number(e.target.value))} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Temperature">
                <TextField type="number" min={0.05} max={1} step={0.05} value={settings.temperature} onChange={(e) => update("temperature", Number(e.target.value))} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Welcome message">
                <AreaField rows={3} value={settings.welcomeMessage} onChange={(e) => update("welcomeMessage", e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel title="AI behavior & public context" description="This is the editable instruction/context layer. Live pricing is also fetched from DB2 at answer time.">
            <div className="space-y-4">
              <Field label="System instructions" hint="Keep this factual and action-oriented. Secret values never belong here.">
                <AreaField rows={9} value={settings.systemPrompt} onChange={(e) => update("systemPrompt", e.target.value)} />
              </Field>
              <Field label="Public knowledge / context" hint="Add FAQs, ordering instructions, policy excerpts, product guidance and other approved public knowledge.">
                <AreaField rows={12} value={settings.publicContext} onChange={(e) => update("publicContext", e.target.value)} />
              </Field>
              <Field label="Current announcement" hint="Used in public answers and the announcement email template when populated.">
                <AreaField rows={5} value={settings.announcement} onChange={(e) => update("announcement", e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel title="Per-user data boundary" description="The assistant is given a server-side whitelist for the authenticated account only. It does not receive credentials, tokens, payment credentials, secrets or other customers.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Company name, website/domain and category",
                "Subscription plan/status/renewal/end/grace dates",
                "Automation name/status/domain/renewal/end state",
                "Pending payment verification status",
                "Installation/domain verification status",
                "Recent order status and target domain",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Account lookups resolve the current session through the existing Supabase auth + tenant middleware. The browser cannot choose another user's client ID.</p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Dedicated Groq connection" description="Owner-only secret control. The key is encrypted at rest in DB3 and is never returned to the browser in plaintext.">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              {data?.groqConfigured ? `Configured · ${data?.groqHint}` : "Not configured"}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">The receptionist uses only this dedicated DB3 Groq key through the canonical LLM router. It does not share the control-center assistant key.</p>
            <div className="mt-4 space-y-4">
              <Field label="New Groq API key" hint={isOwner ? "Leave blank to keep the current key." : "Only an owner can change this secret."}>
                <TextField type="password" autoComplete="new-password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} disabled={!isOwner} placeholder={data?.groqConfigured ? "••••••••••••" : "Paste server-side Groq key"} />
              </Field>
              {isOwner && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => groqMutation.mutate()} disabled={!groqKey.trim() || groqMutation.isPending}>
                    {groqMutation.isPending ? <Loader2 /> : <KeyRound />} Save Groq key
                  </Button>
                  <Button variant="outline" onClick={() => clearGroqMutation.mutate()} disabled={!data?.groqConfigured || clearGroqMutation.isPending}>Clear key</Button>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Email channel" description="Owner configures Resend. End users are emailed only at the address resolved from their signed-in account.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider">
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={settings.emailProvider} onChange={(e) => update("emailProvider", e.target.value as VoiceAgentSettings["emailProvider"])} disabled={!isOwner}>
                  <option value="none">Disabled</option>
                  <option value="resend">Resend</option>
                </select>
              </Field>
              <Field label="Email sending enabled">
                <div className="flex h-10 items-center gap-3 rounded-md border border-input px-3"><Switch checked={settings.emailEnabled} onCheckedChange={(v) => update("emailEnabled", v)} disabled={!isOwner} /><span className="text-sm">{settings.emailEnabled ? "On" : "Off"}</span></div>
              </Field>
              <Field label="From name"><TextField value={settings.emailFromName} onChange={(e) => update("emailFromName", e.target.value)} disabled={!isOwner} /></Field>
              <Field label="From email"><TextField type="email" value={settings.emailFromAddress} onChange={(e) => update("emailFromAddress", e.target.value)} disabled={!isOwner} placeholder="support@your-domain.com" /></Field>
              <Field label="Reply-to"><TextField type="email" value={settings.emailReplyTo} onChange={(e) => update("emailReplyTo", e.target.value)} disabled={!isOwner} /></Field>
              <Field label="Resend API key" hint={isOwner ? "Leave blank to keep current encrypted key." : "Owner-only secret."}><TextField type="password" autoComplete="new-password" value={resendKey} onChange={(e) => setResendKey(e.target.value)} disabled={!isOwner} placeholder={data?.emailConfigured ? "••••••••••••" : "Paste Resend key"} /></Field>
            </div>
            {isOwner && <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => emailMutation.mutate()} disabled={emailMutation.isPending}><Mail /> Save email channel</Button><Button variant="outline" onClick={() => testEmailMutation.mutate()} disabled={testEmailMutation.isPending || !data?.emailConfigured}><TestTube2 /> Send test email</Button></div>}
            {!isOwner && <p className="mt-4 text-xs text-muted-foreground">Partner admins can review the channel state but cannot change the provider secret.</p>}
          </Panel>

          <Panel title="Email templates" description="Templates are server-side. Supported fields are shown below and only approved account data is merged.">
            <div className="grid gap-4">
              <Field label="Template">
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={emailTemplateType} onChange={(e) => setEmailTemplateType(e.target.value as VoiceEmailType)}>
                  {emailOrder.map((type) => <option key={type} value={type}>{emailLabels[type]}</option>)}
                </select>
              </Field>
              <Field label="Subject"><TextField value={emailTemplate.subject} onChange={(e) => setSettings((current) => current ? { ...current, emailTemplates: { ...current.emailTemplates, [emailTemplateType]: { ...current.emailTemplates[emailTemplateType], subject: e.target.value } } } : current)} /></Field>
              <Field label="Body"><AreaField rows={10} value={emailTemplate.body} onChange={(e) => setSettings((current) => current ? { ...current, emailTemplates: { ...current.emailTemplates, [emailTemplateType]: { ...current.emailTemplates[emailTemplateType], body: e.target.value } } } : current)} /></Field>
              <p className="text-xs leading-5 text-muted-foreground">Available: <code>{"{{company_name}}"}</code>, <code>{"{{domain}}"}</code>, <code>{"{{category}}"}</code>, <code>{"{{subscription_summary}}"}</code>, <code>{"{{automation_summary}}"}</code>, <code>{"{{verification_summary}}"}</code>, <code>{"{{installation_summary}}"}</code>, <code>{"{{order_summary}}"}</code>, <code>{"{{account_update_summary}}"}</code>, <code>{"{{announcement}}"}</code>.</p>
            </div>
          </Panel>

          <Panel title="Safe test bench" description="Test either the public knowledge layer or your own authenticated account context. The account test uses the currently signed-in admin session and never accepts a browser-supplied client ID.">
            <Field label="Question"><TextField value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} /></Field>
            <label className="mt-3 flex items-start gap-3 rounded-2xl border border-border p-3">
              <Switch checked={testAccountContext} onCheckedChange={setTestAccountContext} />
              <span><span className="block text-sm font-semibold">Use my account context</span><span className="mt-1 block text-xs text-muted-foreground">Includes the approved company, domain, subscription, automation and verification fields for this signed-in admin account only.</span></span>
            </label>
            <Button className="mt-3" variant="outline" onClick={() => testAiMutation.mutate()} disabled={testAiMutation.isPending || testQuestion.trim().length < 2}><Sparkles /> Test assistant</Button>
            {testAnswer && <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm leading-6">{testAnswer}</div>}
          </Panel>

          <Panel title="Operator checklist" description="The homepage assistant is designed around these controls.">
            <div className="space-y-3 text-sm">
              {[
                ["One-click Start / Stop", "Voice session begins only after an explicit click."],
                ["Mute / unmute", "Microphone and speech input can be paused without leaving text chat."],
                ["60-second inactivity stop", "No meaningful user speech/input resets the timer; assistant TTS does not."],
                ["Text fallback", "Every question can be typed when speech APIs are unavailable."],
                ["Confirmed email actions", "Account emails resolve to the current signed-in account and are sent only through the server email channel."],
              ].map(([title, detail]) => <div key={title} className="flex items-start gap-3 rounded-xl border border-border p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div></div>)}
            </div>
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}
