import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db2Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";
import { enqueueExecution } from "@/lib/automation-engine.server";

type R = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const rec = (v: unknown): R => (v && typeof v === "object" && !Array.isArray(v) ? (v as R) : {});

function verifySignature(raw: string, signature: string, secret: string) {
  if (!secret || !signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.slice(7));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function findAutomation(platform: string, recipient: string) {
  const providers =
    platform === "whatsapp"
      ? ["whatsapp", "meta"]
      : ["meta_page", "messenger", "instagram", "meta"];
  const { data, error } = await db2Admin
    .from("integration_connections")
    .select("automation_id,credential_ciphertext,status")
    .in("provider", providers)
    .eq("status", "connected")
    .limit(200);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    try {
      const c = rec(JSON.parse(decryptSecret(String(row.credential_ciphertext))));
      const ids = [c.phoneNumberId, c.pageId, c.instagramBusinessAccountId, c.igUserId].map(str);
      if (ids.includes(recipient)) return String(row.automation_id);
    } catch {
      // Ignore an unrelated malformed integration and continue looking for the matching asset.
    }
  }
  return null;
}

async function enqueue(platform: string, automationId: string, input: R, idempotencyKey: string) {
  const { data, error } = await db2Admin
    .from("client_automations")
    .select("client_id")
    .eq("id", automationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  await enqueueExecution({
    automationId,
    clientId: String(data.client_id),
    kind: "messaging_ai",
    idempotencyKey: `${platform}:${idempotencyKey}`,
    input,
    triggerType: "meta_webhook",
  });
  return true;
}

export const Route = createFileRoute("/api/public/integrations/meta/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN &&
          url.searchParams.get("hub.challenge")
        ) {
          return new Response(url.searchParams.get("hub.challenge"));
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (
          !verifySignature(
            raw,
            request.headers.get("x-hub-signature-256") || "",
            process.env.META_APP_SECRET || "",
          )
        )
          return new Response("Forbidden", { status: 403 });
        const body = rec(JSON.parse(raw));
        const object = String(body.object || "");
        let queued = 0;
        for (const entry of Array.isArray(body.entry) ? body.entry : []) {
          const e = rec(entry);
          if (object === "whatsapp_business_account") {
            const value = rec(
              e.changes && Array.isArray(e.changes) ? rec(e.changes[0]).value : null,
            );
            const metadata = rec(value.metadata);
            const automationId = await findAutomation("whatsapp", str(metadata.phone_number_id));
            if (!automationId) continue;
            for (const rawMessage of Array.isArray(value.messages) ? value.messages : []) {
              const message = rec(rawMessage);
              const text = rec(message.text);
              if (!str(text.body)) continue;
              if (
                await enqueue(
                  "whatsapp",
                  automationId,
                  {
                    platform: "whatsapp",
                    sender_id: str(message.from),
                    text: str(text.body),
                    message_id: str(message.id),
                  },
                  str(message.id),
                )
              )
                queued++;
            }
          } else {
            const platform = object.includes("instagram") ? "instagram" : "messenger";
            for (const rawMessage of Array.isArray(e.messaging) ? e.messaging : []) {
              const message = rec(rawMessage);
              const recipient = rec(message.recipient);
              const sender = rec(message.sender);
              const text = rec(message.message);
              if (!str(text.text)) continue;
              const automationId = await findAutomation(platform, str(recipient.id));
              if (!automationId) continue;
              if (
                await enqueue(
                  platform,
                  automationId,
                  {
                    platform,
                    sender_id: str(sender.id),
                    text: str(text.text),
                    message_id: str(message.message_id || message.id),
                  },
                  str(message.message_id || message.id),
                )
              )
                queued++;
            }
          }
        }
        return Response.json({ ok: true, queued });
      },
    },
  },
});
