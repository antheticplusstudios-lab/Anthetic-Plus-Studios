import { useEffect } from "react";
import { useBanner } from "@/hooks/use-system-settings";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  info: "bg-secondary text-secondary-foreground",
  warning: "bg-primary text-primary-foreground",
  critical: "bg-destructive text-destructive-foreground",
};

/**
 * Site-wide announcement bar. Renders in normal flow and publishes its height as
 * `--banner-h` so fixed headers can sit below it.
 */
export function SystemBanner() {
  const banner = useBanner();
  const message = String(banner.message ?? "").trim();
  const show = !!banner.enabled && message.length > 0;

  useEffect(() => {
    const root = document.documentElement;
    if (show) root.style.setProperty("--banner-h", "2.5rem");
    else root.style.removeProperty("--banner-h");
    return () => {
      root.style.removeProperty("--banner-h");
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="status"
      className={cn(
        "relative z-[60] flex h-10 items-center justify-center px-4 text-center text-sm font-semibold",
        TONES[String(banner.tone ?? "info")] ?? TONES["info"],
      )}
    >
      <span className="truncate">{message}</span>
    </div>
  );
}
