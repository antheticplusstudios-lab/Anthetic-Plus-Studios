import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  Send,
  ShieldAlert,
  Square,
  Volume2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceOrb } from "@/components/assistant/voice-orb";
import { cn } from "@/lib/utils";
import { getAssistantConfig } from "@/lib/assistant-agent.functions";
import { useAssistantSession, type ChatEntry } from "@/assistant/use-assistant-session";
import { useVoiceLoop, type VoiceState } from "@/voice/use-voice-loop";

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Ready to talk",
  listening: "Listening…",
  processing: "Thinking…",
  speaking: "Speaking…",
  error: "Voice unavailable",
};

function Outcome({ a }: { a: NonNullable<ChatEntry["actions"]>[number] }) {
  const Icon =
    a.status === "success" ? CheckCircle2 : a.status === "denied" ? ShieldAlert : XCircle;
  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
        a.status === "success"
          ? "border-primary/30 bg-primary/5 text-foreground"
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

export function AssistantConsole({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const getConfig = useServerFn(getAssistantConfig);
  const { data: config } = useQuery({
    queryKey: ["assistant-config"],
    queryFn: () => getConfig(),
    staleTime: 60_000,
  });
  const session = useAssistantSession();
  const voice = useVoiceLoop(session.send);
  const [input, setInput] = useState("");
  const [speakReplies, setSpeakReplies] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const voiceActive =
    voice.state === "listening" || voice.state === "processing" || voice.state === "speaking";
  const enabled = config?.enabled !== false;
  const voiceAllowed = enabled && config?.voiceEnabled !== false && voice.supported.input;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session.entries.length, session.busy, voice.interim]);

  const submit = async () => {
    const text = input.trim();
    if (!text || session.busy) return;
    setInput("");
    const reply = await session.send(text);
    if (reply && speakReplies && !voiceActive) voice.say(reply);
    inputRef.current?.focus();
  };

  const stopAll = () => {
    voice.stop();
    session.cancel();
  };

  const toggleVoice = () => {
    if (voiceActive || session.busy) {
      stopAll();
      return;
    }
    if (!voiceAllowed) return;
    void voice.start();
  };

  const displayState: VoiceState = voiceActive
    ? voice.state
    : session.busy
      ? "processing"
      : voice.state;
  const orbExpanded = voiceActive || Boolean(voice.interim);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl",
        variant === "full" ? "h-[calc(100vh-10rem)] min-h-[560px]" : "h-[620px]",
      )}
    >
      <div className="relative shrink-0 border-b border-border p-3 sm:p-4">
        <VoiceOrb
          state={displayState}
          muted={voice.muted}
          entries={session.entries}
          interim={voice.interim}
          expanded={orbExpanded}
          onToggle={toggleVoice}
        />

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {voiceActive || session.busy ? (
            <Button size="sm" variant="outline" onClick={stopAll}>
              <Square className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void voice.start()}
              disabled={!voiceAllowed}
              aria-label="Start voice conversation"
            >
              {voiceAllowed ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} Talk
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => voice.toggleMute()}
            aria-pressed={voice.muted}
            disabled={!voice.supported.input}
          >
            {voice.muted ? (
              <MicOff className="h-4 w-4 text-destructive" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {voice.muted ? "Unmute" : "Mute"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSpeakReplies((v) => !v)}
            aria-pressed={speakReplies}
            disabled={!voice.supported.output}
          >
            <Volume2 className="h-4 w-4" />{" "}
            {speakReplies ? "Read replies: on" : "Read replies: off"}
          </Button>
        </div>

        {voice.error && (
          <p className="mt-2 text-center text-xs text-destructive" role="alert">
            {voice.error}
          </p>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
        {session.entries.length === 0 && (
          <p className="text-muted-foreground">
            {config?.welcomeMessage ||
              "Hi! Ask me about our automations and pricing, or sign in for help with your account."}
          </p>
        )}

        {session.entries.map((e) =>
          e.role === "user" ? (
            <div
              key={e.id}
              className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground"
            >
              {e.content}
            </div>
          ) : (
            <div
              key={e.id}
              className={cn(
                "max-w-[90%] leading-relaxed",
                e.isError ? "text-destructive" : "text-foreground",
              )}
            >
              {e.content}
              {e.actions?.map((a, i) => (
                <Outcome key={i} a={a} />
              ))}
            </div>
          ),
        )}

        {voice.interim && (
          <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2 italic text-muted-foreground">
            {voice.interim}
          </div>
        )}

        {session.busy && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Working on it…
          </div>
        )}

        {session.pending && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-semibold">{session.pending.title}</p>
            <dl className="mt-2 space-y-1 text-xs">
              {session.pending.fields.map((f) => (
                <div key={f.label} className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-muted-foreground">{f.label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void session.confirm()} disabled={session.busy}>
                <CheckCircle2 className="h-4 w-4" /> Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => session.dismiss()}
                disabled={session.busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        {!session.signedIn && (
          <p className="mb-2 text-xs text-muted-foreground">
            <Link
              to="/auth"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Sign in
            </Link>{" "}
            to check your account or send emails.
          </p>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            void submit();
          }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void submit();
              }
            }}
            placeholder={enabled ? "Type a message…" : "The assistant is offline"}
            disabled={!enabled}
            rows={1}
            maxLength={1200}
            className="max-h-32 min-h-10 resize-none"
            aria-label="Message the assistant"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!enabled || session.busy || !input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
