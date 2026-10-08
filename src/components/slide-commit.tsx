import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * SlideCommit — drag the handle to the end to commit an action. Keyboard: focus + Enter/Space or ArrowRight to end.
 * It only calls onCommit; it never decides the outcome (e.g. it submits a payment for HUMAN verification).
 */
export function SlideCommit({
  label,
  busyLabel = "Submitting…",
  disabled,
  busy,
  onCommit,
  className,
}: {
  label: string;
  busyLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onCommit: () => void;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const max = () => (track.current?.clientWidth ?? 300) - 52;
  const commit = () => {
    if (!disabled && !busy) {
      setX(max());
      onCommit();
      setTimeout(() => setX(0), 600);
    }
  };
  const pct = Math.min(1, x / Math.max(1, max()));
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-disabled={disabled || busy}
      onKeyDown={(e) => {
        if (["Enter", " ", "ArrowRight", "End"].includes(e.key)) {
          e.preventDefault();
          commit();
        }
      }}
      className={cn(
        "relative h-14 w-full select-none overflow-hidden rounded-full border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "opacity-60",
        className,
      )}
      onPointerMove={(e) => {
        if (drag === null) return;
        setX(Math.max(0, Math.min(max(), e.clientX - drag)));
      }}
      onPointerUp={() => {
        if (drag === null) return;
        setDrag(null);
        if (pct > 0.9) commit();
        else setX(0);
      }}
      onPointerLeave={() => {
        if (drag !== null) {
          setDrag(null);
          setX(0);
        }
      }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-primary/20"
        style={{ width: x + 52, transition: drag === null ? "width .3s" : "none" }}
      />
      <span
        className="absolute inset-0 flex items-center justify-center pl-10 text-sm font-bold text-muted-foreground"
        style={{ opacity: 1 - pct }}
      >
        {busy ? busyLabel : label}
      </span>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || busy}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag(e.clientX - x);
        }}
        className="absolute left-1 top-1 flex h-12 w-12 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
        style={{
          transform: `translateX(${x}px)`,
          transition: drag === null ? "transform .3s" : "none",
        }}
      >
        →
      </button>
    </div>
  );
}
