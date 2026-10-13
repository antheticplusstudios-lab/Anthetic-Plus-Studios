import { createServerFn } from "@tanstack/react-start";
import { contactSchema, looksLikeSpam } from "@/lib/contact-schema";

const SUPPORT_INBOX = "antheticplusstudios@gmail.com";

export type ContactResult =
  | { status: "sent" }
  | { status: "not_configured"; inbox: string }
  | { status: "failed"; message: string };

export const submitContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }): Promise<ContactResult> => {
    // Silently accept bot submissions without delivering them.
    if (looksLikeSpam(data)) return { status: "sent" };
    const { sendEmail, EmailNotConfiguredError } = await import("@/assistant/email.server");
    try {
      await sendEmail({
        to: SUPPORT_INBOX,
        replyTo: data.email,
        subject: `[Contact · ${data.topic}] ${data.name}`,
        text: `Name: ${data.name}\nEmail: ${data.email}\nCompany: ${data.company || "—"}\nTopic: ${data.topic}\n\n${data.message}`,
      });
      return { status: "sent" };
    } catch (e) {
      if (e instanceof EmailNotConfiguredError)
        return { status: "not_configured", inbox: SUPPORT_INBOX };
      return {
        status: "failed",
        message: "We couldn't send your message right now. Please try again shortly.",
      };
    }
  });
