import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Loader2, Mic, MicOff, Pause, Send } from "lucide-react";
import { getAssistantConfig } from "@/lib/assistant-agent.functions";
import { useAssistantSession } from "@/assistant/use-assistant-session";
import { useVoiceLoop } from "@/voice/use-voice-loop";
import { OrbStatus, PulseOrb, type OrbState } from "@/components/assistant/pulse-orb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const prompts = [
  "What can you automate?",
  "Show me the fastest way to start",
  "Tell me about voice AI",
];

export function SignalDesk() {
  const getConfig = useServerFn(getAssistantConfig);
  const { data: config } = useQuery({
    queryKey: ["assistant-config"],
    queryFn: () => getConfig(),
    staleTime: 60_000,
  });
  const session = useAssistantSession();
  const voice = useVoiceLoop(session.send, session.cancel);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const active =
    voice.state === "listening" || voice.state === "processing" || voice.state === "speaking";
  const enabled = config?.enabled !== false;
  const voiceAllowed = enabled && config?.voiceEnabled !== false && voice.supported.input;
  const state: OrbState = voice.state === "processing" ? "thinking" : voice.state;

  useEffect(() => {
    if (session.entries.length > 0) inputRef.current?.focus();
  }, [session.entries.length]);

  const submit = async (value = input) => {
    const text = value.trim();
    if (text.length < 3 || session.busy || !enabled) return;
    setInput("");
    await session.send(text);
  };

  const stop = () => {
    voice.stop();
    session.cancel();
  };

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#10122b] p-4 text-white shadow-[0_32px_100px_-40px_rgba(41,24,130,0.95)] sm:p-5">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(119,91,255,0.28),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.08),transparent_46%)]"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
              Signal desk
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">Talk to the studio</h2>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/60">
            <span
              className={cn("h-1.5 w-1.5 rounded-full bg-emerald-300", active && "animate-pulse")}
            />
            {active ? "Live session" : "Ready when you are"}
          </span>
        </div>

        <div className="relative mt-4 flex min-h-[275px] flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/10 px-5 py-7 text-center">
          <div
            className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-200/25 to-transparent"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => (active || session.busy ? stop() : voiceAllowed && void voice.start())}
            disabled={!enabled || (!voiceAllowed && !active && !session.busy)}
            aria-label={active || session.busy ? "Stop the voice session" : "Start a voice session"}
            aria-pressed={active}
            className="group relative grid h-[190px] w-[190px] place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-4 focus-visible:ring-offset-[#10122b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PulseOrb
              state={state}
              size={184}
              levelRef={voice.audioLevelRef}
              colorFrom="#9b5cff"
              colorTo="#55e5ff"
            />
            <span className="relative grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-[#151734]/85 shadow-lg backdrop-blur">
              {session.busy || voice.state === "processing" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : active ? (
                <Pause className="h-5 w-5" />
              ) : voiceAllowed ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MicOff className="h-5 w-5" />
              )}
            </span>
          </button>
          <OrbStatus state={state} />
          <p className="mt-2 text-sm font-semibold">
            {active
              ? voice.state === "speaking"
                ? "AntheticPlus is speaking"
                : voice.state === "listening"
                  ? "Listening for your question"
                  : "Finding the right answer"
              : enabled
                ? "Tap the orb to start a voice conversation"
                : "Assistant is temporarily offline"}
          </p>
          {voice.error && (
            <p className="mt-1 text-xs text-rose-200" role="alert">
              {voice.error}
            </p>
          )}
        </div>

        {session.entries.length > 0 && (
          <div className="mt-3 max-h-24 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm">
            {session.entries.slice(-2).map((entry) => (
              <p
                key={entry.id}
                className={entry.role === "user" ? "text-cyan-100" : "text-white/75"}
              >
                <span className="mr-2 text-[10px] font-bold uppercase tracking-widest text-white/35">
                  {entry.role === "user" ? "You" : "Desk"}
                </span>
                {entry.content}
              </p>
            ))}
          </div>
        )}

        <form
          className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 pl-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            disabled={!enabled || session.busy}
            placeholder="Ask the studio anything..."
            aria-label="Ask the AntheticPlus assistant"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!enabled || session.busy || input.trim().length < 3}
            className="h-10 w-10 rounded-xl bg-white text-[#171938] hover:bg-cyan-100"
            aria-label="Send question"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void submit(prompt)}
              disabled={!enabled || session.busy}
              className="rounded-full border border-white/10 px-3 py-1.5 text-left text-[11px] text-white/55 transition-colors hover:border-cyan-200/40 hover:text-white disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-white/40">
          <span>Multilingual voice + chat</span>
          <Link
            to="/contact"
            className="flex items-center gap-1 font-semibold text-cyan-200 hover:text-white"
          >
            Build yours <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
