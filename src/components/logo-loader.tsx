/** Branded loading indicator. */
export function LogoLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5"
      role="status"
      aria-label={label}
    >
      <div className="loader" aria-hidden="true" />
      <p className="sr-only">{label}</p>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="loader" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
