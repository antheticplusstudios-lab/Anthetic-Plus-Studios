import { z } from "zod";
import { defineTool } from "../assistant.registry.server";
import {
  EmailDeliveryError,
  EmailNotConfiguredError,
  isValidEmail,
  sendEmail,
} from "../email.server";

const input = z.object({
  to: z.string().trim().toLowerCase(),
  subject: z.string().trim(),
  body: z.string().trim(),
});

export const sendEmailTool = defineTool<z.infer<typeof input>>({
  name: "send_email",
  label: "Send email",
  description:
    "Send an email on the user's behalf. Requires a full recipient email address — if the user gives only a name, ask for the address; never guess one. Write a short, clear subject and body in the user's voice. Client (non-staff) accounts may only email their own account address; use 'me' for the user's own address.",
  inputDoc:
    '{"to":"name@example.com or me","subject":"string (max 160 chars)","body":"string (max 4000 chars)"}',
  access: "member",
  sideEffect: true,
  input,
  authorize(data, ctx) {
    if (!ctx.settings.emailActionsEnabled || !ctx.site.config.emailEnabled)
      return "Email actions are turned off right now.";
    const own = (ctx.auth?.tenant.email ?? "").toLowerCase();
    const to = data.to === "me" ? own : data.to;
    if (!isValidEmail(to))
      return "That doesn't look like a valid email address. Could you give me the full address?";
    if (!data.subject || data.subject.length > 160)
      return "The subject needs to be between 1 and 160 characters.";
    if (!data.body || data.body.length > 4000)
      return "The message needs to be between 1 and 4000 characters.";
    if (!ctx.auth?.tenant.isStaff && to !== own) {
      return "For security, client accounts can only send assistant emails to their own account address.";
    }
    return null;
  },
  preview(data, ctx) {
    const to = data.to === "me" ? (ctx.auth?.tenant.email ?? "") : data.to;
    return {
      title: `Send an email to ${to}`,
      fields: [
        { label: "To", value: to },
        { label: "Subject", value: data.subject },
        { label: "Message", value: data.body },
      ],
    };
  },
  async execute(data, ctx) {
    const to = data.to === "me" ? (ctx.auth?.tenant.email ?? "").toLowerCase() : data.to;
    try {
      const sent = await sendEmail({
        to,
        subject: data.subject,
        text: data.body,
        replyTo: ctx.auth?.tenant.email ?? null,
      });
      return {
        ok: true,
        summary: `Email sent to ${to}.`,
        data: { to, providerMessageId: sent.id },
      };
    } catch (e) {
      if (e instanceof EmailNotConfiguredError)
        return { ok: false, code: "not_configured", message: e.message };
      if (e instanceof EmailDeliveryError) return { ok: false, code: "failed", message: e.message };
      console.error("send_email failed", e);
      return {
        ok: false,
        code: "failed",
        message: "The email couldn't be sent. Please try again shortly.",
      };
    }
  },
});
