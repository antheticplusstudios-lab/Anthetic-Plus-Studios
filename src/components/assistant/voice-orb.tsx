import { useMemo } from "react";
import { Loader2, Mic, MicOff, Sparkles, Square, Volume2 } from "lucide-react";
import type { ChatEntry } from "@/assistant/use-assistant-session";
import type { VoiceState } from "@/voice/use-voice-loop";
import { cn } from "@/lib/utils";

const LABEL: Record<VoiceState, string> = {
  idle: "Ready to talk",
  listening: "Listening",
  processing: "Thinking",
  speaking: "Speaking",
  error: "Voice unavailable",
};

const STYLE = `
.ap-orb-shell{position:relative;display:flex;min-height:340px;align-items:center;justify-content:center;overflow:hidden;border-radius:1.75rem;border:1px solid hsl(var(--border));background:radial-gradient(circle at 50% 44%,hsl(var(--primary)/.12),transparent 42%),linear-gradient(145deg,hsl(var(--card)),hsl(var(--background)));isolation:isolate}
.ap-orb-shell:before{content:"";position:absolute;inset:-35%;background:conic-gradient(from 0deg,transparent 0 18%,hsl(var(--primary)/.08) 26%,transparent 36% 58%,hsl(190 90% 55%/.07) 66%,transparent 78%);animation:ap-orb-ambient 18s linear infinite;z-index:-1}
.ap-orb-shell[data-state="listening"]:before{animation-duration:7s}
.ap-orb-shell[data-state="processing"]:before{animation-duration:4s}
.ap-orb-shell[data-state="speaking"]:before{animation-duration:3s}
.ap-orb-button{position:relative;flex:0 0 220px;width:220px;height:220px;border:0;border-radius:9999px;padding:0;background:transparent;cursor:pointer;transition:transform .35s cubic-bezier(.2,.8,.2,1),filter .35s ease;touch-action:manipulation}
.ap-orb-button:hover{transform:scale(1.045)}
.ap-orb-button:active{transform:scale(.96)}
.ap-orb-button:focus-visible{outline:2px solid hsl(var(--primary));outline-offset:6px}
.ap-orb-core{position:absolute;inset:30px;border-radius:50%;background:radial-gradient(circle at 34% 25%,#fff 0 4%,hsl(190 95% 76%/.9) 10%,hsl(var(--primary)) 35%,hsl(250 70% 34%) 67%,#070711 100%);box-shadow:inset 12px 10px 24px #fff4,inset -18px -18px 30px #0008,0 0 28px hsl(var(--primary)/.35),0 0 70px hsl(var(--primary)/.14);transition:transform .5s ease,box-shadow .5s ease}
.ap-orb-core:before{content:"";position:absolute;inset:10%;border-radius:50%;background:conic-gradient(from 90deg,transparent 0 15%,#fff9 20%,transparent 31%,hsl(190 100% 72%/.75) 44%,transparent 57%,hsl(var(--primary)/.8) 70%,transparent 83%);filter:blur(8px);animation:ap-orb-spin 8s linear infinite}
.ap-orb-core:after{content:"";position:absolute;inset:23%;border-radius:50%;background:radial-gradient(circle,#fff9 0 4%,hsl(190 100% 78%/.7) 12%,transparent 60%);animation:ap-orb-breathe 2.8s ease-in-out infinite}
.ap-orb-ring{position:absolute;inset:14px;border-radius:50%;border:2px solid hsl(190 95% 72%/.8);box-shadow:0 0 12px hsl(190 95% 65%/.35),0 0 30px hsl(var(--primary)/.25),inset 0 0 18px hsl(190 95% 65%/.12);animation:ap-ring-a 4.8s linear infinite}
.ap-orb-ring:nth-child(2){inset:3px;border-color:hsl(var(--primary)/.8);box-shadow:0 0 14px hsl(var(--primary)/.35),0 0 38px hsl(var(--primary)/.18);animation:ap-ring-b 7s linear infinite reverse}
.ap-orb-ring:nth-child(3){inset:-10px;border:1px solid hsl(190 90% 65%/.45);box-shadow:0 0 18px hsl(190 90% 65%/.18),0 0 48px hsl(var(--primary)/.16);animation:ap-ring-c 10s linear infinite}
.ap-orb-wave{position:absolute;left:50%;top:50%;display:flex;height:38px;width:76px;align-items:center;justify-content:center;gap:3px;transform:translate(-50%,-50%);opacity:.82}
.ap-orb-wave i{display:block;width:3px;height:10px;border-radius:999px;background:#fff;box-shadow:0 0 8px #fff8;animation:ap-wave 1s ease-in-out infinite}
.ap-orb-wave i:nth-child(2){animation-delay:.08s}.ap-orb-wave i:nth-child(3){animation-delay:.16s}.ap-orb-wave i:nth-child(4){animation-delay:.24s}.ap-orb-wave i:nth-child(5){animation-delay:.32s}.ap-orb-wave i:nth-child(6){animation-delay:.24s}.ap-orb-wave i:nth-child(7){animation-delay:.16s}.ap-orb-wave i:nth-child(8){animation-delay:.08s}
.ap-orb-mic{position:absolute;left:50%;top:50%;z-index:3;display:grid;height:42px;width:42px;place-items:center;border-radius:50%;transform:translate(-50%,-50%);background:#080812b8;backdrop-filter:blur(8px);color:#fff;box-shadow:0 4px 20px #0006}
.ap-orb-caption{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid hsl(var(--border));border-radius:999px;background:hsl(var(--background)/.84);padding:7px 12px;font-size:11px;font-weight:700;backdrop-filter:blur(12px);box-shadow:0 8px 24px #0003}
.ap-orb-peek{position:absolute;left:14px;right:14px;bottom:50px;z-index:5;pointer-events:none;display:flex;flex-direction:column;align-items:stretch;gap:6px;max-height:92px;overflow:hidden;mask-image:linear-gradient(to bottom,transparent 0,#000 20%,#000 100%);opacity:0;transform:translateY(14px) scale(.98);transition:opacity .3s ease,transform .3s ease}
.ap-orb-shell[data-expanded="true"] .ap-orb-peek{opacity:1;transform:translateY(0) scale(1)}
.ap-orb-msg{align-self:flex-start;max-width:82%;border:1px solid hsl(var(--border));border-radius:12px 12px 12px 4px;background:hsl(var(--card)/.9);padding:7px 10px;font-size:11px;line-height:1.35;box-shadow:0 6px 18px #0002;backdrop-filter:blur(12px)}
.ap-orb-msg.user{align-self:flex-end;border-color:hsl(var(--primary)/.28);background:hsl(var(--primary)/.12);border-radius:12px 12px 4px 12px}
.ap-orb-interim{position:absolute;left:18px;right:18px;top:18px;z-index:6;border:1px solid hsl(var(--primary)/.25);border-radius:12px;background:hsl(var(--background)/.78);padding:7px 10px;font-size:11px;color:hsl(var(--muted-foreground));backdrop-filter:blur(10px);opacity:0;transform:translateY(-6px);transition:.25s ease}
.ap-orb-shell[data-expanded="true"] .ap-orb-interim{opacity:1;transform:translateY(0)}
.ap-orb-shell[data-state="listening"] .ap-orb-core{animation:ap-listen 1.4s ease-in-out infinite}
.ap-orb-shell[data-state="processing"] .ap-orb-core{animation:ap-think 1.1s ease-in-out infinite}
.ap-orb-shell[data-state="speaking"] .ap-orb-core{animation:ap-speak .72s ease-in-out infinite}
.ap-orb-shell[data-state="error"] .ap-orb-core{filter:saturate(.7);box-shadow:inset 12px 10px 24px #fff4,inset -18px -18px 30px #0008,0 0 28px hsl(var(--destructive)/.4)}
.ap-orb-shell[data-muted="true"] .ap-orb-core{filter:saturate(.45);box-shadow:inset 12px 10px 24px #fff4,inset -18px -18px 30px #0008,0 0 28px hsl(var(--destructive)/.3)}
@keyframes ap-orb-ambient{to{transform:rotate(360deg)}}@keyframes ap-orb-spin{to{transform:rotate(360deg)}}@keyframes ap-orb-breathe{0%,100%{transform:scale(.88);opacity:.7}50%{transform:scale(1.08);opacity:1}}@keyframes ap-ring-a{0%{transform:rotate(0deg) scale(.98)}50%{transform:rotate(180deg) scale(1.02)}100%{transform:rotate(360deg) scale(.98)}}@keyframes ap-ring-b{0%{transform:rotate(360deg) scale(1)}50%{transform:rotate(180deg) scale(1.04)}100%{transform:rotate(0deg) scale(1)}}@keyframes ap-ring-c{0%,100%{transform:scale(1);opacity:.45}50%{transform:scale(1.07);opacity:.8}}@keyframes ap-wave{0%,100%{height:9px;opacity:.55}50%{height:28px;opacity:1}}@keyframes ap-listen{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}@keyframes ap-think{0%,100%{transform:scale(.98) rotate(0)}50%{transform:scale(1.035) rotate(3deg)}}@keyframes ap-speak{0%,100%{transform:scale(.98)}50%{transform:scale(1.07)}}
@media (prefers-reduced-motion:reduce){.ap-orb-shell:before,.ap-orb-core:before,.ap-orb-core:after,.ap-orb-ring,.ap-orb-wave i,.ap-orb-core{animation:none!important}}
@media (max-width:420px){.ap-orb-shell{min-height:320px}.ap-orb-button{flex-basis:200px;width:200px;height:200px}.ap-orb-core{inset:28px}.ap-orb-peek{bottom:46px}}
`;

export function VoiceOrb({
  state,
  muted,
  entries,
  interim,
  expanded,
  onToggle,
}: {
  state: VoiceState;
  muted: boolean;
  entries: ChatEntry[];
  interim: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const preview = useMemo(() => entries.filter((e) => !e.isError).slice(-2), [entries]);
  const active = state === "listening" || state === "processing" || state === "speaking";

  const icon =
    state === "processing" ? (
      <Loader2 className="h-5 w-5 animate-spin" />
    ) : muted ? (
      <MicOff className="h-5 w-5" />
    ) : active ? (
      <Square className="h-4 w-4" />
    ) : (
      <Mic className="h-5 w-5" />
    );

  return (
    <div className="ap-orb-shell" data-state={state} data-expanded={expanded} data-muted={muted}>
      <style>{STYLE}</style>
      {interim && <div className="ap-orb-interim">“{interim}”</div>}
      <div className="ap-orb-peek" aria-live="polite">
        {preview.map((entry) => (
          <div key={entry.id} className={cn("ap-orb-msg", entry.role === "user" && "user")}>
            {entry.content}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ap-orb-button"
        onClick={onToggle}
        aria-label={active ? "Stop voice conversation" : "Start voice conversation"}
        aria-pressed={active}
      >
        <span className="ap-orb-ring" />
        <span className="ap-orb-ring" />
        <span className="ap-orb-ring" />
        <span className="ap-orb-core">
          <span className="ap-orb-wave" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <span className="ap-orb-mic">{icon}</span>
        </span>
      </button>
      <div className="ap-orb-caption" role="status" aria-live="polite">
        {state === "listening" ? (
          <Mic className="h-3.5 w-3.5 text-primary" />
        ) : state === "processing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : state === "speaking" ? (
          <Volume2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        )}
        <span>{muted ? "Microphone muted" : LABEL[state]}</span>
      </div>
    </div>
  );
}
