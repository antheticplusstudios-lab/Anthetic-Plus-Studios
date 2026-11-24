import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { AUTUMIC_MARK_PATH, AUTUMIC_MARK_VIEWBOX as VB } from "./autumic-mark-path";
import "./ai-orb.css";

/** Visual states of the signature orb. Every value is derived from real assistant/voice state. */
export type AiOrbState = "idle" | "listening" | "processing" | "speaking" | "success" | "error";

const AiOrbScene = lazy(() => import("./ai-orb-scene"));

const LABEL: Record<AiOrbState, string> = {
  idle: "Assistant ready",
  listening: "Assistant is listening",
  processing: "Assistant is thinking",
  speaking: "Assistant is speaking",
  success: "Action completed",
  error: "Assistant hit a problem",
};

function canUseWebGL() {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("webgl2") ?? c.getContext("webgl");
    // Release the probe context right away; browsers cap live WebGL contexts (~16).
    ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(ctx);
  } catch {
    return false;
  }
}

/**
 * Crystal-glass Autumic orb. A CSS glass sphere renders on the server and under reduced motion;
 * on capable clients a lazily loaded React Three Fiber scene fades in over it and reacts to the
 * live voice level (`levelRef`) and assistant state. Rendering pauses while off-screen.
 */
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
  const [gl, setGl] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageShown, setPageShown] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setGl(!mq.matches && canUseWebGL());
    update();
    mq.addEventListener("change", update);
    const node = el.current;
    const io = node
      ? new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)))
      : null;
    if (node) io?.observe(node);
    const onVis = () => setPageShown(document.visibilityState !== "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener("change", update);
      io?.disconnect();
    };
  }, []);

  return (
    <div
      ref={el}
      className={`ai-orb ${className}`}
      data-state={state}
      data-unavailable={unavailable}
      data-gl={gl && ready ? "ready" : "off"}
      style={size === undefined ? undefined : ({ "--size": `${size}px` } as React.CSSProperties)}
    >
      <span className="ai-orb__halo" aria-hidden />
      <span className="ai-orb__ring" aria-hidden />
      <span className="ai-orb__ring ai-orb__ring--2" aria-hidden />
      <span className="ai-orb__glass" aria-hidden>
        <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}>
          <path d={AUTUMIC_MARK_PATH} fillRule="evenodd" />
        </svg>
      </span>
      {gl && (
        <div className="ai-orb__canvas" aria-hidden>
          <Suspense fallback={null}>
            <AiOrbScene
              stateRef={stateRef}
              levelRef={levelRef}
              active={visible && pageShown}
              onReady={() => setReady(true)}
            />
          </Suspense>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {unavailable ? "Assistant unavailable" : LABEL[state]}
      </span>
    </div>
  );
}
