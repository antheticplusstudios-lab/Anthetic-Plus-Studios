/** Shared official Autumic brand mark used by the site and workspace shells. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={
        compact
          ? "inline-flex items-center"
          : "inline-flex min-w-0 items-center gap-2.5"
      }
    >
      <img
        src="/brand/autumics-symbol.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-8 w-auto shrink-0 object-contain sm:h-9"
      />
      {!compact && (
        <span className="hidden min-w-0 leading-none sm:block">
          <img
            src="/brand/autumics-wordmark.svg"
            alt="Autumic"
            draggable={false}
            className="h-3 w-auto max-w-[124px] object-contain object-left sm:h-[15px]"
          />
          <span className="mt-1.5 block truncate text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Build To Automate
          </span>
        </span>
      )}
    </span>
  );
}
