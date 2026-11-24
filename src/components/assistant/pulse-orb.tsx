import { useEffect, useRef, type RefObject } from "react";
import "./pulse-orb.css";

/** Pulse Orb — original implementation of the supplied spec. Visual state is CSS-driven;
 * a single rAF loop writes --orb-level (0..1) from a live audio ref, pausing offscreen and under reduced motion. */
export type OrbState =
  "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error" | "disabled";

const STATUS: Record<OrbState, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice unavailable",
  disabled: "Voice disabled",
};

const wave = (x: number) => 0.5 - 0.5 * Math.cos(x);
/** Procedural energy used when there is no live audio (levelRef < 0). Exported for tests. */
export function stateEnergy(state: OrbState, t: number) {
  switch (state) {
    case "listening":
      return 0.4 + 0.32 * wave(t * 17) + 0.18 * wave(t * 8.2 + 3);
    case "speaking":
      return 0.3 + 0.24 * wave(t * 12.4) + 0.16 * wave(t * 6 + 1.2);
    case "thinking":
      return 0.24 + 0.2 * wave(t * 4.8);
    case "connecting":
      return 0.12 + 0.1 * wave(t * 3.2);
    case "error":
      return 0.2;
    default:
      return 0;
  }
}
export const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Mic amplitude 0..1 while active; -1 when unavailable (orb falls back to procedural motion). */
export function useAudioLevel(active: boolean): RefObject<number> {
  const ref = useRef(-1);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      ref.current = -1;
      return;
    }
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const data = new Uint8Array(an.fftSize);
        let lvl = 0;
        const tick = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
          lvl += (rms - lvl) * 0.25;
          ref.current = lvl;
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => (ref.current = -1));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      ref.current = -1;
    };
  }, [active]);
  return ref;
}

export function PulseOrb({
  state = "idle",
  size = 168,
  speed = 1,
  colorFrom = "#818cf8",
  colorTo = "#22d3ee",
  levelRef,
  className = "",
}: {
  state?: OrbState;
  size?: number;
  speed?: number;
  colorFrom?: string;
  colorTo?: string;
  levelRef?: RefObject<number>;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)));
    io.observe(node);
    let raf = 0;
    let last = performance.now();
    let level = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (visible) {
        const live = levelRef?.current ?? -1;
        const target = live >= 0 ? live : stateEnergy(stateRef.current, (now / 1000) * speed);
        level = approach(level, reduce ? target * 0.3 : target, 12, dt);
        node.style.setProperty("--orb-level", level.toFixed(3));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [levelRef, speed]);

  return (
    <div
      ref={el}
      className={`pulse-orb ${className}`}
      data-state={state}
      style={
        {
          "--orb-size": `${size}px`,
          "--orb-speed": speed,
          "--orb-color-from": colorFrom,
          "--orb-color-to": colorTo,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <span className="pulse-orb__ring" />
      <span className="pulse-orb__ring pulse-orb__ring--2" />
      <span className="pulse-orb__glow" />
      <span className="pulse-orb__core" />
    </div>
  );
}

/** Polite live region so state changes are announced; never color-only. */
export function OrbStatus({ state }: { state: OrbState }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {STATUS[state]}
    </span>
  );
}
