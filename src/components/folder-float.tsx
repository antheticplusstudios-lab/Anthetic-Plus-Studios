import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * FolderFloat — original lightweight take on the ReactBits idea (no matter-js).
 * A folder that opens to reveal floating "pills". Keyboard accessible; animation is CSS-only and
 * disabled under prefers-reduced-motion.
 */
export function FolderFloat({
  items,
  label,
  sublabel,
  onSelect,
  className,
}: {
  items: string[];
  label: string;
  sublabel?: string;
  onSelect?: (value: string, index: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="group relative h-24 w-36 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="absolute left-0 top-0 h-4 w-14 rounded-t-xl bg-secondary" aria-hidden />
        <span
          className="absolute inset-x-0 bottom-0 top-3 rounded-2xl rounded-tl-none bg-secondary"
          aria-hidden
        />
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-2 bottom-3 top-5 rounded-lg bg-card shadow-sm transition-transform duration-500 motion-reduce:transition-none",
            open && "-translate-y-2",
          )}
        />
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 top-7 flex origin-bottom flex-col justify-end rounded-2xl bg-primary p-3 text-primary-foreground transition-transform duration-500 motion-reduce:transition-none",
            open
              ? "[transform:perspective(500px)_rotateX(-28deg)]"
              : "[transform:perspective(500px)_rotateX(-10deg)]",
          )}
        >
          <span className="text-xs font-bold leading-tight">{label}</span>
          {sublabel && <span className="text-[10px] opacity-80">{sublabel}</span>}
        </span>
      </button>
      <ul
        id={id}
        className={cn(
          "absolute bottom-full left-1/2 z-20 mb-2 flex w-64 -translate-x-1/2 flex-wrap justify-center gap-1.5 transition-all duration-300 motion-reduce:transition-none",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        {items.map((it, i) => (
          <li key={it} style={{ transitionDelay: open ? `${i * 45}ms` : "0ms" }}>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onSelect?.(it, i);
                setOpen(false);
              }}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium shadow-sm hover:bg-muted"
            >
              {it}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
