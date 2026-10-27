import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const Hero3DScene = lazy(() => import("./hero-3d-scene"));

/**
 * Ambient Luxe Glass 3D layer for public page heroes.
 * Client-only: renders nothing on the server or under reduced motion.
 * Place as the first child of a `relative overflow-hidden` hero section and
 * give the content sibling `relative` so text paints above the canvas.
 */
export function Hero3D({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (!enabled) return null;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <Suspense fallback={null}>
        <Hero3DScene />
      </Suspense>
    </div>
  );
}
