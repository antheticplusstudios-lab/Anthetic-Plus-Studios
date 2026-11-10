import { useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const WHATSAPP_URL =
  "https://api.whatsapp.com/send/?phone=8801915349394&text=Hello+Autumic%2C+I%27d+like+to+learn+more+about+your+AI+automation+solutions.&type=phone_number&app_absent=0";

export function WhatsAppFloat() {
  const isHome = useRouterState({ select: (state) => state.location.pathname === "/" });

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with Autumic on WhatsApp"
      title="Chat with Autumic"
      className={cn(
        "fixed right-5 z-40 grid size-14 place-items-center rounded-full border border-white/20 bg-[#128c52] text-white shadow-[0_12px_35px_rgba(0,0,0,.28)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "bottom-5 [bottom:calc(env(safe-area-inset-bottom)+1.25rem)]",
      )}
    >
      <MessageCircle className="size-6" />
    </a>
  );
}
