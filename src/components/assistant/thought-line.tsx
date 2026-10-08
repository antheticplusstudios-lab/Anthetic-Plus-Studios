import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { VoiceState } from "@/voice/use-voice-loop";
import "./thought-line.css";

/** Derives the ThoughtLine label only from real UI state — never random text. */
export function thoughtFor(s: {
  state: VoiceState;
  interim?: string;
  hasPending?: boolean;
  muted?: boolean;
}) {
  if (s.state === "error") return "Something went wrong — tap the orb to retry";
  if (s.hasPending) return "Waiting for your confirmation…";
  if (s.state === "listening")
    return s.interim ? "Reading the question…" : s.muted ? "Microphone muted" : "Listening…";
  if (s.state === "processing") return "Thinking…";
  if (s.state === "speaking") return "Speaking…";
  return "Ready when you are";
}

/** Real lifecycle trace: steps are appended only as the assistant actually reaches them. */
export function useThoughtSteps(state: VoiceState, interim?: string, hasPending?: boolean) {
  const [steps, setSteps] = useState<string[]>([]);
  useEffect(() => {
    const push = (s: string) => setSteps((p) => (p[p.length - 1] === s ? p : [...p, s]));
    if (state === "idle" && !hasPending) return;
    if (state === "listening") {
      setSteps((p) =>
        p.length && p[p.length - 1] !== "Listening" && p[p.length - 1] !== "Reading the question"
          ? []
          : p,
      );
      push(interim ? "Reading the question" : "Listening");
    } else if (state === "processing") push("Thinking");
    else if (state === "speaking") push("Speaking the answer");
    if (hasPending) push("Waiting for your confirmation");
  }, [state, interim, hasPending]);
  return steps;
}

const fmt = (ds: number) =>
  ds < 600
    ? `${(ds / 10).toFixed(1)}s`
    : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`;

/** ReactBits ThoughtLine (JS + CSS variant), adapted: breathing sparkle, shimmer, live timer, collapsible trace. */
export function ThoughtLineCore({
  label,
  working,
  steps,
  doneLabel = "Thought for",
  error = false,
  fontSize = 14,
  breathPeriod = 1.6,
  breathDepth = 0.45,
}: {
  label: string;
  working: boolean;
  steps: string[];
  doneLabel?: string;
  error?: boolean;
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    if (working) {
      setOpen(true);
      setRan(true);
    } else setOpen(false);
  }, [working]);

  useEffect(() => {
    const g = glyphRef.current;
    if (!g) return;
    const depth = reduce ? Math.min(breathDepth, 0.2) : breathDepth;
    const a =
      working && depth > 0
        ? animate(
            g,
            { opacity: [1 - depth, 1, 1 - depth] },
            {
              duration: reduce ? breathPeriod * 1.5 : breathPeriod,
              repeat: Infinity,
              ease: [0.77, 0, 0.175, 1],
            },
          )
        : animate(g, { opacity: 0.55 }, { duration: 0.35 });
    return () => a.stop();
  }, [working, reduce, breathDepth, breathPeriod]);

  useLayoutEffect(() => {
    if (!working) return;
    const start = performance.now();
    const id = setInterval(() => {
      if (timerRef.current)
        timerRef.current.textContent = fmt(Math.floor((performance.now() - start) / 100));
    }, 100);
    if (timerRef.current) timerRef.current.textContent = "0.0s";
    return () => clearInterval(id);
  }, [working]);

  const settled = !working && ran && !error;
  const text = settled ? doneLabel : label;
  const hasTrace = steps.length > 0;

  return (
    <div
      className="thought-line"
      data-working={working || undefined}
      data-open={open || undefined}
      style={{ fontSize }}
    >
      <button
        type="button"
        className="thought-line__head"
        data-toggle={hasTrace || undefined}
        onClick={() => hasTrace && setOpen((o) => !o)}
        aria-expanded={hasTrace ? open : undefined}
        disabled={!hasTrace}
      >
        <span
          ref={glyphRef}
          className="thought-line__glyph"
          data-error={error || undefined}
          aria-hidden="true"
        >
          <HugeiconsIcon icon={SparklesIcon} size="100%" strokeWidth={1.8} />
        </span>
        <span className="thought-line__breath" data-shimmer={working && !reduce ? true : undefined}>
          {text}
        </span>
        {(working || settled) && <span ref={timerRef} className="thought-line__timer" />}
        {hasTrace && (
          <span className="thought-line__chevron" aria-hidden="true">
            <HugeiconsIcon icon={ArrowDown01Icon} size="1em" />
          </span>
        )}
      </button>
      <div className="thought-line__trace" data-open={open && hasTrace ? true : undefined}>
        <div className="thought-line__fold">
          <ol className="thought-line__steps">
            {steps.map((s, i) => {
              const done = i < steps.length - 1 || !working;
              return (
                <li key={`${i}-${s}`} className="thought-line__step" data-done={done || undefined}>
                  <span className="thought-line__mark" aria-hidden="true">
                    {done ? (
                      <HugeiconsIcon icon={Tick02Icon} size="1em" />
                    ) : (
                      <span className="thought-line__pulse" />
                    )}
                  </span>
                  <span className="thought-line__step-text">{s}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

export function ThoughtLine(props: {
  state: VoiceState;
  interim?: string;
  hasPending?: boolean;
  muted?: boolean;
}) {
  const label = thoughtFor(props);
  const steps = useThoughtSteps(props.state, props.interim, props.hasPending);
  const working =
    props.state === "listening" || props.state === "processing" || props.state === "speaking";
  return (
    <div className="mt-2 flex justify-center text-muted-foreground">
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
      <ThoughtLineCore
        label={label}
        working={working}
        steps={steps}
        error={props.state === "error"}
      />
    </div>
  );
}
