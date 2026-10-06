/**
 * Shared email delivery through the existing Resend configuration:
 * DB1 platform_settings "voice_agent_email" (encrypted key, sender identity)
 * with RESEND_API_KEY as server-side fallback. Reused by every email action.
 */
import { db1Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Email sending isn't set up yet. An owner can configure it under Admin → AI Voice Agent.",
    );
    this.name = "EmailNotConfiguredError";
  }
}

export class EmailDeliveryError extends Error {
  constructor(message = "The email provider couldn't deliver that message.") {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function readEmailConfig() {
  const [emailRow, agentRow] = await Promise.all([
    db1Admin.from("platform_settings").select("value").eq("key", "voice_agent_email").maybeSingle(),
    db1Admin.from("platform_settings").select("value").eq("key", "voice_agent").maybeSingle(),
  ]);
  const stored = rec(emailRow.data?.value);
  const agent = rec(agentRow.data?.value);
  let key = process.env.RESEND_API_KEY?.trim() || "";
  const ciphertext = typeof stored.apiKeyCiphertext === "string" ? stored.apiKeyCiphertext : "";
  if (!key && ciphertext) {
    try {
      key = decryptSecret(ciphertext);
    } catch {
      key = "";
    }
  }
  return {
    key,
    provider: String(stored.provider ?? agent.emailProvider ?? "none"),
    enabled: Boolean(stored.enabled ?? agent.emailEnabled ?? false),
    fromName: String(stored.fromName ?? agent.emailFromName ?? "AntheticPlus Studios"),
    fromEmail: String(stored.fromEmail ?? agent.emailFromAddress ?? "").trim(),
    replyTo: String(stored.replyTo ?? agent.emailReplyTo ?? "").trim(),
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
}) {
  const cfg = await readEmailConfig();
  if (!cfg.enabled || cfg.provider !== "resend" || !cfg.key || !isValidEmail(cfg.fromEmail)) {
    throw new EmailNotConfiguredError();
  }
  const payload: Record<string, unknown> = {
    from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
    to: [args.to],
    subject: args.subject,
    text: args.text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(args.text).replace(/\n/g, "<br>")}</div>`,
  };
  const replyTo =
    args.replyTo && isValidEmail(args.replyTo)
      ? args.replyTo
      : isValidEmail(cfg.replyTo)
        ? cfg.replyTo
        : "";
  if (replyTo) payload.reply_to = replyTo;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new EmailDeliveryError("The email service didn't respond in time. Please try again.");
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || !json.id) {
    console.error(
      "resend rejected email",
      response.status,
      String(json.message ?? "").slice(0, 200),
    );
    throw new EmailDeliveryError(
      response.status === 422 || response.status === 400
        ? "The email provider rejected that message. Please check the recipient address."
        : "The email provider couldn't deliver that message.",
    );
  }
  return { id: String(json.id), provider: "resend" as const };
}
