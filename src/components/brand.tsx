/** Autumic wordmark. The official logo asset can replace this monogram when supplied. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "inline-flex" : "flex min-w-0 items-center gap-2.5"}>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-black text-lg font-semibold tracking-tight text-white shadow-sm"
      >
        A
      </span>
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className="block truncate text-[15px] font-semibold tracking-tight text-foreground">
            Autumic
          </span>
          <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Build To Automate
          </span>
        </span>
      )}
    </span>
  );
}
