import { Skeleton } from "@/components/ui/skeleton";

/** Branded loading mark: pulsing orb with orbiting ring. */
export function LogoLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5" role="status" aria-label={label}>
      <div className="relative h-16 w-16">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary [animation-duration:1.1s]" />
        <span className="absolute inset-3 animate-pulse rounded-full bg-primary shadow-[0_0_30px_var(--primary)]" />
        <span className="absolute inset-0 grid place-items-center text-sm font-extrabold text-primary-foreground">A+</span>
      </div>
      <p className="animate-pulse text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6 animate-fade-in">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
