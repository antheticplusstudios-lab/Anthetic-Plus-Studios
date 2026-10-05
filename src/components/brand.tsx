import mark from "@/assets/antheticplus-mark.png";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "inline-flex" : "flex min-w-0 items-center gap-2.5"}>
      <img
        src={mark}
        alt={compact ? "AntheticPlus Studios" : ""}
        width={816}
        height={816}
        loading={compact ? "lazy" : "eager"}
        className="h-9 w-9 shrink-0 rounded-xl object-cover"
      />
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className="block truncate text-[15px] font-extrabold tracking-tight text-foreground">AntheticPlus</span>
          <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Studios
          </span>
        </span>
      )}
    </span>
  );
}
