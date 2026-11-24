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
  ["What does Autumic automate for businesses?", "আপনারা কোন কোন অটোমেশন দেন?"],
  ["Tell me about Autumic in Bangla", "Autumic সম্পর্কে বাংলায় বলুন"],
  ["Which business tasks can I automate?", "কোন ব্যবসায়িক কাজ অটোমেট করতে পারি?"],
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

  const statusText =
    orbState === "listening"
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
                  : t("Assistant unavailable", "অ্যাসিস্ট্যান্ট পাওয়া যাচ্ছে না");

  const hasConversation =
    session.entries.length > 0 || Boolean(session.pending) || Boolean(voice.interim);

  return (
    <section className="home-hero relative isolate overflow-hidden">
      <div aria-hidden className="hero-orb-atmosphere pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="container-page relative flex flex-col items-center pb-16 pt-12 text-center sm:pt-16 lg:pb-24">
        <Entrance className="flex flex-col items-center">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />{" "}
            {t("AI automation company", "AI অটোমেশন কোম্পানি")}
          </span>
          <h1 className="h-display hero-title mt-5 max-w-4xl">
            {t("Build To", "অটোমেশনের")}{" "}
            <span className="text-gradient-blue">{t("Automate", "জন্য তৈরি")}</span>
          </h1>
          <p className="lead mx-auto mt-5 max-w-xl">
            {t(
              "We build AI employees that answer customers, generate sales and automate your operations 24/7.",
              "আমরা তৈরি করি এমন AI কর্মী, যারা ২৪/৭ গ্রাহকের উত্তর দেয়, বিক্রয় বাড়াতে সহায়তা করে এবং ব্যবসার কাজ স্বয়ংক্রিয় করে।",
            )}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="hero" size="xl" asChild>
              <Link to="/contact">
                {t("Book a free consultation", "বিনামূল্যে পরামর্শ নিন")} <ArrowRight />
              </Link>
            </Button>
            <Button variant="pill" size="xl" asChild>
              <Link to="/automations">
                <PlayCircle className="text-primary" /> {t("Explore solutions", "সমাধানগুলো দেখুন")}
              </Link>
            </Button>
          </div>
        </Entrance>

        {/* Orb centerpiece, wired to the real voice loop */}
        <Entrance className="relative mt-6 flex w-full flex-col items-center" delay={0.08}>
          <Button
            variant="ghost"
            type="button"
            onClick={toggleVoice}
            disabled={!voiceAllowed && !voiceActive && !session.busy}
            aria-label={voiceActive ? "Stop voice conversation" : "Start voice conversation"}
            aria-pressed={voiceActive}
            className="h-auto w-auto rounded-full p-0 transition-transform duration-500 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 enabled:cursor-pointer enabled:hover:scale-[1.015] disabled:cursor-default disabled:opacity-100"
          >
            <AiOrb
              state={orbState}
              unavailable={!enabled}
              levelRef={voice.audioLevelRef}
              className="[--orb-responsive-size:300px] sm:[--orb-responsive-size:400px] lg:[--orb-responsive-size:460px]"
            />
          </Button>

          {/* Voice dock */}
          <div className="voice-dock relative -mt-6 w-full max-w-xl">
            <p
              className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground"
              aria-hidden
            >
              {statusText}
            </p>

            {hasConversation && (
              <div
                ref={scrollRef}
                className="voice-transcript mb-3 max-h-64 space-y-2.5 overflow-y-auto p-3 text-left text-sm"
                aria-live="polite"
              >
                {session.entries.map((e) =>
                  e.role === "user" ? (
                    <div key={e.id} className="msg-in ml-auto max-w-[85%]">
                      <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground">
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
                            "whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border px-3.5 py-2 leading-relaxed",
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
            )}

            {voice.error && (
              <p className="mb-2 text-xs text-destructive" role="alert">
                {voice.error}
              </p>
            )}
            <form
              className="voice-dock-bar flex items-center gap-2 p-1.5"
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
                variant={voiceActive ? "default" : "secondary"}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full disabled:opacity-40"
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
                    ? t("Ask Autumic anything…", "Autumic-কে কিছু জিজ্ঞাসা করুন…")
                    : t("The assistant is offline", "অ্যাসিস্ট্যান্ট এখন অফলাইন")
                }
                disabled={!enabled}
                maxLength={1200}
                aria-label="Message the assistant"
                className="min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {session.busy ? (
                <Button
                  type="button"
                  onClick={stopAll}
                  aria-label="Cancel response"
                  size="icon"
                  variant="secondary"
                  className="h-10 w-10 shrink-0 rounded-full"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!enabled || !input.trim()}
                  aria-label="Send"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </form>

            {!hasConversation && enabled && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map(([se, sb]) => (
                  <Button
                    key={se}
                    type="button"
                    onClick={() => void send(t(se, sb))}
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal rounded-full px-3 py-1.5 text-xs"
                  >
                    {t(se, sb)}
                  </Button>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
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
        </Entrance>

        <ul className="mt-14 grid w-full max-w-4xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title[0]} className="hero-chip flex min-w-0 items-start gap-2.5 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                <h.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-bold text-foreground">
                  {t(h.title[0], h.title[1])}
                </span>
                <span className="block text-xs text-muted-foreground">{t(h.sub[0], h.sub[1])}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
