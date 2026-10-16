import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitContact } from "@/lib/contact.functions";

/** One-click request asking support to turn on a Twilio phone line for an automation. */
export function RequestPhoneLine({
  automationName,
  domain,
  email,
  name,
}: {
  automationName: string;
  domain?: string | null | undefined;
  email?: string | null | undefined;
  name?: string | null | undefined;
}) {
  const send = useServerFn(submitContact);
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  if (!email) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={state !== "idle"}
      onClick={async () => {
        setState("busy");
        try {
          await send({
            data: {
              name: (name || email.split("@")[0] || "Client").padEnd(2, "_"),
              email,
              company: "",
              topic: "support",
              message: `Please turn on a Twilio phone line (calls & SMS) for my ${automationName}${domain ? ` on ${domain}` : ""}.`,
              website: "",
              startedAt: Date.now() - 5000,
            },
          });
          setState("sent");
          toast.success("Request sent — our team will turn on your phone line.");
        } catch {
          setState("idle");
          toast.error("Could not send the request. Please try again.");
        }
      }}
    >
      <Phone />{" "}
      {state === "sent"
        ? "Phone line requested"
        : state === "busy"
          ? "Sending…"
          : "Request phone line"}
    </Button>
  );
}
