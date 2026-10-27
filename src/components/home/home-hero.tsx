import BlockDrift from "@/components/originkit/ui/block-drift";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  AudioLines,
  Bot,
  CheckCircle2,
  Globe2,
  Mic,
  MicOff,
  PlayCircle,
  Send,
  ShieldAlert,
  Square,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiOrb, type AiOrbState } from "@/components/assistant/ai-orb";
import { getAssistantConfig } from "@/lib/assistant-agent.functions";
import { useAssistantSession, type ChatEntry } from "@/assistant/use-assistant-session";
import { useVoiceLoop } from "@/voice/use-voice-loop";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Entrance } from "@/components/motion";

const HIGHLIGHTS = [
  {
    icon: Bot,
    title: ["AI assistants", "AI অ্যাসিস্ট্যান্ট"],
    sub: ["Answer & qualify", "উত্তর ও যাচাই"],
  },
  {
    icon: AudioLines,
    title: ["Voice AI", "ভয়েস AI"],
    sub: ["Speak naturally", "স্বাভাবিকভাবে কথা বলুন"],
  },
  { icon: Zap, title: ["Automation", "অটোমেশন"], sub: ["Route & follow up", "রাউট ও ফলো-আপ"] },
  {
    icon: Globe2,
    title: ["Multilingual", "বহুভাষিক"],
    sub: ["বাংলা · English", "বাংলা · English"],
  },
] as const;

const SUGGESTIONS = [
  ["What automations do you offer?", "আপনারা কোন কোন অটোমেশন দেন?"],
  ["Tell me about AntheticPlus in Bangla", "AntheticPlus সম্পর্কে বাংলায় বলুন"],
  ["How does payment verification work?", "পেমেন্ট যাচাই কীভাবে হয়?"],
] as const;

function Outcome({ a }: { a: NonNullable<ChatEntry["actions"]>[number] }) {
  const Icon =
    a.status === "success" ? CheckCircle2 : a.status === "denied" ? ShieldAlert : XCircle;
  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
        a.status === "success"
          ? "border-success/30 bg-success/5 text-foreground"
          : "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-semibold">{a.label}:</span> {a.summary}
      </span>
    </div>
  );
}

function time(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Homepage hero: copy + live AI Orb + compact assistant chat, all driven by one real session. */
export function HomeHero() {
  const t = useT();
  const getConfig = useServerFn(getAssistantConfig);
  const { data: config } = useQuery({
    queryKey: ["assistant-config"],
    queryFn: () => getConfig(),
    staleTime: 60_000,
    retry: false,
  });
  const session = useAssistantSession();
  const voice = useVoiceLoop(session.send, session.cancel);
  const [input, setInput] = useState("");
  const [success, setSuccess] = useState(false);
  const [stamps] = useState(() => new Map<string, string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const enabled = config?.enabled === true;
  const voiceActive =
    voice.state === "listening" || voice.state === "processing" || voice.state === "speaking";
  const voiceAllowed = enabled && config?.voiceEnabled !== false && voice.supported.input;
  const last = session.entries[session.entries.length - 1];

  // Success pulse only when the server actually reports a completed tool action.
  useEffect(() => {
    if (!last || last.role !== "assistant" || last.isStreaming || !last.actions?.length) return;
    if (!last.actions.every((a) => a.status === "success")) return;
    setSuccess(true);
    const t = setTimeout(() => setSuccess(false), 2400);
    return () => clearTimeout(t);
  }, [last]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session.entries, session.busy, voice.interim]);

  const orbState: AiOrbState =
    voice.state === "error" || (last?.isError && !session.busy && !voiceActive)
      ? "error"
      : voice.state === "listening"
        ? "listening"
        : voice.state === "speaking"
          ? "speaking"
          : voice.state === "processing" || session.busy
            ? "processing"
            : success
              ? "success"
              : "idle";

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || session.busy || !enabled) return;
    setInput("");
    await session.send(text);
    inputRef.current?.focus();
  };

  const stopAll = () => {
    voice.stop();
    session.cancel();
  };

  const toggleVoice = () => {
    if (voiceActive || session.busy) return stopAll();
    if (voiceAllowed) void voice.start();
  };

  const stamp = (id: string) => {
    if (!stamps.has(id)) stamps.set(id, time());
    return stamps.get(id);
  };

  return (
    <section className="home-hero relative isolate overflow-hidden hero-bg">
      <div aria-hidden className="block-drift pointer-events-none absolute inset-0 z-0">
        <BlockDrift
          speed={4}
          density={7}
          fade={6}
          shade={14}
          clearCentre={4}
          edgeWidth={1}
          style={{ position: "absolute", inset: 0 }}
        />
      </div>
      <div className="hero-atmosphere pointer-events-none absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-40 bg-gradient-to-b from-transparent to-background" />
      <div className="container-page relative z-10 grid items-center gap-10 pb-14 pt-10 lg:grid-cols-[1.05fr_1fr_0.95fr] lg:gap-6 lg:pb-20 lg:pt-16">
        {/* Copy */}
        <Entrance className="order-1 text-center lg:text-left">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />{" "}
            {t("AI workforce platform", "AI ওয়ার্কফোর্স প্ল্যাটফর্ম")}
          </span>
          <h1 className="h-display mt-5">
            {t("Build. Automate. Grow.", "গড়ুন। অটোমেট করুন। এগিয়ে যান।")}
          </h1>
          <p className="lead mx-auto mt-5 max-w-lg lg:mx-0">
            {t(
              "Intelligent AI tools for voice conversations, workflow automation, AI agents, and business insights — connected in one platform.",
              "ভয়েস কথোপকথন, ওয়ার্কফ্লো অটোমেশন, AI এজেন্ট ও ব্যবসার তথ্য বিশ্লেষণের বুদ্ধিমান টুল — এক প্ল্যাটফর্মে।",
            )}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Button variant="hero" size="xl" asChild>
              <Link to="/auth">
                {t("Get Started", "শুরু করুন")} <ArrowRight />
              </Link>
            </Button>
            <Button variant="pill" size="xl" asChild>
              <Link to="/automations">
                <PlayCircle className="text-primary" />{" "}
                {t("Explore the Platform", "প্ল্যাটফর্ম দেখুন")}
              </Link>
            </Button>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-4 text-left sm:grid-cols-4 lg:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title[0]} className="flex min-w-0 items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <h.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[13px] font-bold text-foreground">
                    {t(h.title[0], h.title[1])}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(h.sub[0], h.sub[1])}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Entrance>

        {/* Orb */}
        <div className="order-2 flex flex-col items-center">
          <Button
            variant="ghost"
            type="button"
            onClick={toggleVoice}
            disabled={!voiceAllowed && !voiceActive && !session.busy}
            aria-label={voiceActive ? "Stop voice conversation" : "Start voice conversation"}
            aria-pressed={voiceActive}
            className="h-auto w-auto rounded-full p-0 transition-transform hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 enabled:cursor-pointer enabled:hover:scale-[1.02] disabled:cursor-default disabled:opacity-100"
          >
            <AiOrb
              state={orbState}
              unavailable={!enabled}
              levelRef={voice.audioLevelRef}
              className="[--orb-responsive-size:240px] sm:[--orb-responsive-size:300px] xl:[--orb-responsive-size:340px]"
            />
          </Button>
          <p className="mt-2 text-xs font-semibold text-muted-foreground" aria-hidden>
            {orbState === "listening"
              ? t("Listening… I can hear you", "শুনছি… বলুন")
              : orbState === "processing"
                ? t("Thinking…", "ভাবছি…")
                : orbState === "speaking"
                  ? t("Speaking…", "বলছি…")
                  : orbState === "success"
                    ? t("Done", "সম্পন্ন")
                    : orbState === "error"
                      ? t(
                          "Something went wrong — tap to retry",
                          "সমস্যা হয়েছে — আবার চেষ্টা করতে ট্যাপ করুন",
                        )
                      : voiceAllowed
                        ? t("Tap the orb to talk", "কথা বলতে অর্বে ট্যাপ করুন")
                        : enabled
                          ? t("Type below to chat", "চ্যাট করতে নিচে লিখুন")
                          : t("Assistant unavailable", "অ্যাসিস্ট্যান্ট পাওয়া যাচ্ছে না")}
          </p>
        </div>

        {/* Chat widget */}
        <Entrance className="order-3 mx-auto w-full max-w-md" delay={0.12}>
          <div className="surface-card home-chat flex h-[440px] flex-col overflow-hidden shadow-elevated">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                <AudioLines className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">
                  {t("Talk to AntheticPlus", "AntheticPlus-এর সাথে কথা বলুন")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {enabled
                    ? t("Multilingual voice assistant", "বহুভাষিক ভয়েস অ্যাসিস্ট্যান্ট")
                    : t("Assistant is offline", "অ্যাসিস্ট্যান্ট এখন অফলাইন")}
                </p>
              </div>
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  enabled ? "bg-success" : "bg-muted-foreground",
                )}
                aria-hidden
              />
            </header>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface/60 px-4 py-4 text-sm"
              aria-live="polite"
            >
              {session.entries.length === 0 && (
                <div className="msg-in space-y-3">
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-body">
                    {config?.welcomeMessage ||
                      (enabled
                        ? t(
                            "Hi! Ask me about our automations and pricing — in English or বাংলা.",
                            "হ্যালো! আমাদের অটোমেশন ও মূল্য সম্পর্কে জিজ্ঞাসা করুন — বাংলা বা English-এ।",
                          )
                        : t(
                            "The assistant is currently unavailable. You can still explore our products or contact the team.",
                            "অ্যাসিস্ট্যান্ট এখন পাওয়া যাচ্ছে না। আমাদের প্রোডাক্ট দেখুন বা টিমের সাথে যোগাযোগ করুন।",
                          ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map(([se, sb]) => (
                      <Button
                        key={se}
                        type="button"
                        disabled={!enabled}
                        onClick={() => void send(t(se, sb))}
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal rounded-lg px-2.5 py-1.5 text-left text-xs"
                      >
                        {t(se, sb)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {session.entries.map((e) =>
                e.role === "user" ? (
                  <div key={e.id} className="msg-in ml-auto max-w-[85%]">
                    <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-primary-foreground">
                      {e.content}
                    </div>
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">
                      {stamp(e.id)}
                    </p>
                  </div>
                ) : (
                  <div key={e.id} className="msg-in flex max-w-[92%] gap-2">
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border px-3.5 py-2.5 leading-relaxed",
                          e.isError
                            ? "border-destructive/30 bg-destructive/5 text-destructive"
                            : "border-border bg-card text-foreground",
                        )}
                      >
                        {e.content}
                        {e.actions?.map((a, i) => (
                          <Outcome key={i} a={a} />
                        ))}
                      </div>
                      {!e.isStreaming && (
                        <p className="mt-1 text-[10px] text-muted-foreground">{stamp(e.id)}</p>
                      )}
                    </div>
                  </div>
                ),
              )}

              {voice.interim && (
                <div className="ml-auto max-w-[85%] rounded-2xl bg-accent px-3.5 py-2 italic text-accent-foreground">
                  {voice.interim}
                </div>
              )}

              {session.busy && !last?.isStreaming && (
                <div className="flex items-center gap-1.5 pl-8" aria-label="Assistant is typing">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </div>
              )}

              {session.pending && (
                <div className="msg-in rounded-xl border border-primary/30 bg-accent/60 p-3">
                  <p className="text-sm font-semibold text-foreground">{session.pending.title}</p>
                  <dl className="mt-2 space-y-1 text-xs">
                    {session.pending.fields.map((f) => (
                      <div key={f.label} className="flex gap-2">
                        <dt className="w-16 shrink-0 font-semibold text-muted-foreground">
                          {f.label}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void session.confirm()}
                      disabled={session.busy}
                    >
                      {t("Confirm", "নিশ্চিত করুন")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => session.dismiss()}>
                      {t("Cancel", "বাতিল")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border bg-card p-3">
              {voice.error && (
                <p className="mb-2 text-xs text-destructive" role="alert">
                  {voice.error}
                </p>
              )}
              <form
                className="flex items-center gap-2 rounded-full border border-input bg-background p-1 pl-1 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void send(input);
                }}
              >
                <Button
                  type="button"
                  onClick={toggleVoice}
                  disabled={!voiceAllowed && !voiceActive}
                  aria-label={voiceActive ? "Stop voice" : "Speak to the assistant"}
                  aria-pressed={voiceActive}
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40",
                    voiceActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-accent-foreground hover:bg-accent/70",
                  )}
                >
                  {voiceActive ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : voiceAllowed ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )}
                </Button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    enabled
                      ? t("Type or speak a message…", "লিখুন বা বলুন…")
                      : t("The assistant is offline", "অ্যাসিস্ট্যান্ট এখন অফলাইন")
                  }
                  disabled={!enabled}
                  maxLength={1200}
                  aria-label="Message the assistant"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {session.busy ? (
                  <Button
                    type="button"
                    onClick={stopAll}
                    aria-label="Cancel response"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!enabled || !input.trim()}
                    aria-label="Send"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </form>
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
                {session.signedIn ? (
                  <span>
                    {t(
                      "Signed in — I can help with your account.",
                      "সাইন ইন করা আছে — অ্যাকাউন্টে সাহায্য করতে পারি।",
                    )}
                  </span>
                ) : (
                  <span>
                    <Link to="/auth" className="font-semibold text-primary hover:underline">
                      {t("Sign in", "সাইন ইন")}
                    </Link>{" "}
                    {t("for account help.", "করুন অ্যাকাউন্ট সহায়তার জন্য।")}
                  </span>
                )}
                {voice.supported.input && (
                  <Button
                    type="button"
                    onClick={() => voice.toggleMute()}
                    aria-pressed={voice.muted}
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-[11px] font-semibold hover:text-foreground"
                  >
                    {voice.muted ? t("Unmute mic", "মাইক চালু") : t("Mute mic", "মাইক বন্ধ")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Entrance>
      </div>
    </section>
  );
}
