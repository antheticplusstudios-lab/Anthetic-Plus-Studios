/** Shared official brand mark used by the site and workspace shells. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={compact ? "inline-flex items-center" : "inline-flex min-w-0 items-center gap-2"}
    >
      <img
        src="/brand/autumics-symbol.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-8 w-auto shrink-0 object-contain invert dark:invert-0 sm:h-9"
      />
      {!compact && (
        <span className="block min-w-0 leading-none">
          <img
            src="/brand/autumics-wordmark.svg"
            alt="Autumic"
            draggable={false}
            className="h-[11px] w-auto max-w-[88px] object-contain object-left invert dark:invert-0 sm:h-[15px] sm:max-w-[124px]"
          />
          <span className="mt-1.5 hidden truncate text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:block">
            Build To Automate
          </span>
        </span>
      )}
    </span>
  );
}
