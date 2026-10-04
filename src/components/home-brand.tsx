import { Link, useRouterState } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

/** Logo + wordmark that always leads to the homepage hero; scrolls up smoothly if already there. */
export function HomeBrand({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const handle = (e: MouseEvent) => {
    onNavigate?.();
    if (path === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (window.location.hash) history.replaceState(null, "", "/");
    }
  };
  return (
    <Link
      to="/"
      onClick={handle}
      aria-label="AntheticPlus Studios — home"
      className={cn("min-w-0 rounded-xl transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Brand />
    </Link>
  );
}
