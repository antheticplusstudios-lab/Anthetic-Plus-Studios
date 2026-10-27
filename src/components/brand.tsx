import { useEffect, useRef, useState } from "react";

/** Logo image with a built-in "A+" monogram fallback if the image file can't load. */
export function Brand({ compact = false }: { compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <span className={compact ? "inline-flex" : "flex min-w-0 items-center gap-2.5"}>
      {failed ? (
        <span
          role="img"
          aria-label={compact ? "AntheticPlus Studios" : undefined}
          aria-hidden={compact ? undefined : true}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-extrabold tracking-tight text-primary-foreground shadow-sm"
        >
          A+
        </span>
      ) : (
        <img
          ref={ref}
          src="/favicon.png"
          alt={compact ? "AntheticPlus Studios" : ""}
          width={256}
          height={256}
          loading="eager"
          onError={() => setFailed(true)}
          className="h-9 w-9 shrink-0 rounded-xl object-cover"
        />
      )}
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className="block truncate text-[15px] font-extrabold tracking-tight text-foreground">
            AntheticPlus
          </span>
          <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Studios
          </span>
        </span>
      )}
    </span>
  );
}
