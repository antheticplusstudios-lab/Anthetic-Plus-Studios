import type { ReactNode } from "react";

/**
 * Looping error scene: a little receptionist bot whose signal keeps
 * pinging out into the void while its antenna searches for a connection.
 */
export function ErrorScene({ code, title, children }: { code: string; title: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="err-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative max-w-md text-center">
        <div className="relative mx-auto h-48 w-48" aria-hidden>
          <span className="err-ring absolute inset-0 rounded-full border-2 border-primary/60" />
          <span className="err-ring err-ring-2 absolute inset-0 rounded-full border-2 border-primary/60" />
          <span className="err-ring err-ring-3 absolute inset-0 rounded-full border-2 border-primary/60" />
          <div className="err-orbit absolute inset-0">
            <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_16px_var(--color-primary)]" />
          </div>
          <div className="err-bob absolute left-1/2 top-1/2">
            <div className="relative">
              <span className="err-antenna absolute -top-6 left-1/2 block h-6 w-0.5 origin-bottom bg-foreground/70">
                <span className="err-blink absolute -left-1 -top-2 h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <div className="flex h-16 w-20 items-center justify-center gap-3 rounded-2xl border-2 border-foreground/80 bg-card">
                <span className="err-eye block h-3 w-3 rounded-full bg-foreground" />
                <span className="err-eye block h-3 w-3 rounded-full bg-foreground" />
              </div>
            </div>
          </div>
        </div>
        <p className="err-glitch mt-6 text-7xl font-extrabold tabular-nums tracking-tight text-foreground" data-text={code}>
          {code}
        </p>
        <h1 className="mt-3 text-xl font-bold text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  );
}
