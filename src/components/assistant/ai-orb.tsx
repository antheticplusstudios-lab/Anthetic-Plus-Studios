import { useEffect, useRef, type RefObject } from "react";
import { approach, stateEnergy, type OrbState } from "@/components/assistant/pulse-orb";
import { advanceOrbit } from "./orb-motion";
import "./ai-orb.css";

/** Visual states of the signature orb. Every value is derived from real assistant/voice state. */
export type AiOrbState = "idle" | "listening" | "processing" | "speaking" | "success" | "error";

const LABEL: Record<AiOrbState, string> = {
  idle: "Assistant ready",
  listening: "Assistant is listening",
  processing: "Assistant is thinking",
  speaking: "Assistant is speaking",
  success: "Action completed",
  error: "Assistant hit a problem",
};

const toPulse = (s: AiOrbState): OrbState =>
  s === "processing" ? "thinking" : s === "success" ? "idle" : s;

export function AiOrb({
  state,
  size,
  levelRef,
  className = "",
  unavailable = false,
}: {
  state: AiOrbState;
  size?: number;
  levelRef?: RefObject<number>;
  className?: string;
  unavailable?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let raf = 0;
    let last = performance.now();
    let level = 0;
    let angle = 0;
    let velocity = 22.5;
    let floatTime = 0;
    let previousLevel = -1;
    const loop = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden && !motionPreference.matches) {
        const s = stateRef.current;
        const live = levelRef?.current ?? -1;
        const target =
          s === "listening" || s === "speaking"
            ? live >= 0
              ? live
              : stateEnergy(toPulse(s), now / 1000)
            : stateEnergy(toPulse(s), now / 1000);
        level = approach(level, target, 8, dt);
        if (Math.abs(level - previousLevel) > 0.002) {
          node.style.setProperty("--orb-level", level.toFixed(3));
          previousLevel = level;
        }
        node.style.setProperty(
          "--mouth",
          s === "speaking" ? Math.min(1, level * 1.6).toFixed(3) : "0",
        );
        ({ angle, velocity } = advanceOrbit(angle, velocity, s, dt));
        floatTime += Math.min(dt, 0.05);
        node.style.setProperty("--orbit-angle", `${angle.toFixed(3)}deg`);
        node.style.setProperty("--orbit-angle-secondary", `${(-angle / 1.4 + 120).toFixed(3)}deg`);
        node.style.setProperty(
          "--orb-float",
          `${(-5 + 5 * Math.cos((floatTime * Math.PI) / 3)).toFixed(3)}px`,
        );
        raf = requestAnimationFrame(loop);
      }
    };
    const sync = () => {
      const active = visible && !document.hidden && !motionPreference.matches;
      node.dataset["motion"] = active ? "running" : "paused";
      if (active && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } else if (!active) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    motionPreference.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motionPreference.removeEventListener("change", sync);
    };
  }, [levelRef]);

  return (
    <div
      ref={el}
      className={`ai-orb ${className}`}
      data-state={state}
      data-unavailable={unavailable}
      style={size === undefined ? undefined : ({ "--size": `${size}px` } as React.CSSProperties)}
    >
      <span className="ai-orb__halo" aria-hidden />
      <span className="ai-orb__floor" aria-hidden />
      <span className="ai-orb__ripple" aria-hidden />
      <span className="ai-orb__ripple ai-orb__ripple--2" aria-hidden />
      <div className="ai-orb__body" aria-hidden>
        <Orbit layer="back" />
        <Orbit layer="back" second />
        <span className="ai-orb__core" />
        <div className="ai-orb__face">
          <div className="ai-orb__eyes">
            <span className="ai-orb__eye" />
            <span className="ai-orb__eye" />
          </div>
          <span className="ai-orb__mouth" />
        </div>
        <Orbit layer="front" />
        <Orbit layer="front" second />
      </div>
      <span className="ai-orb__bars" aria-hidden>
        {[0.5, 0.85, 1, 0.75, 0.45].map((k, i) => (
          <i key={i} style={{ "--k": k } as React.CSSProperties} />
        ))}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {unavailable ? "Assistant unavailable" : LABEL[state]}
      </span>
    </div>
  );
}

function Orbit({ layer, second = false }: { layer: "back" | "front"; second?: boolean }) {
  return (
    <span className={`ai-orb__orbit ai-orb__orbit--${layer}${second ? " ai-orb__orbit--2" : ""}`}>
      <span className="ai-orb__spin">
        <span className="ai-orb__sat" />
      </span>
    </span>
  );
}
