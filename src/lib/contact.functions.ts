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

    // Always save to the admin inbox first, so no message is lost even if email is down.
    let savedId: string | null = null;
    try {
      const { getDb } = await import("@/server/db/clients.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db1 = getDb("db1") as any;
      const { data: row } = await db1
        .from("contact_messages")
        .insert({
          platform: "antheticplus",
          name: data.name,
          email: data.email,
          company: data.company || null,
          topic: data.topic,
          message: data.message,
        })
        .select("id")
        .maybeSingle();
      savedId = row?.id ?? null;
    } catch (e) {
      console.error("contact save failed", e);
    }

    const { sendEmail, EmailNotConfiguredError } = await import("@/assistant/email.server");
    try {
      await sendEmail({
        to: SUPPORT_INBOX,
        replyTo: data.email,
        subject: `[Contact · ${data.topic}] ${data.name}`,
        text: `Name: ${data.name}\nEmail: ${data.email}\nCompany: ${data.company || "—"}\nTopic: ${data.topic}\n\n${data.message}`,
      });
      await sendEmail({
        to: data.email,
        subject: "We got your message — AntheticPlus Studios",
        text: `Hi ${data.name},\n\nThanks for reaching out. Our team has your message and will reply soon.\n\n— AntheticPlus Studios`,
      }).catch(() => undefined);
      if (savedId) {
        const { getDb } = await import("@/server/db/clients.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (getDb("db1") as any)
          .from("contact_messages")
          .update({ delivered: true })
          .eq("id", savedId);
      }
      return { status: "sent" };
    } catch (e) {
      if (e instanceof EmailNotConfiguredError)
        return savedId ? { status: "sent" } : { status: "not_configured", inbox: SUPPORT_INBOX };
      if (savedId) return { status: "sent" };
      return {
        status: "failed",
        message: "We couldn't send your message right now. Please try again shortly.",
      };
    }
  });
