import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db2Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";
import { runReceptionistTurn } from "@/lib/automation-engine.server";
import { markMessageDelivered, sendTwilioMessage } from "@/lib/integration-delivery.server";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
async function findAutomation(to: string) {
  const { data, error } = await db2Admin
    .from("client_automations")
    .select(
      "id,client_id,automation_type,product_type,status,run_state,enabled,is_active,expires_at,config,metadata",
    )
    .eq("metadata->>assigned_phone_number", to)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function form(request: Request) {
  const fd = await request.formData();
  const p: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") p[k] = v;
  });
  return p;
}
function valid(url: string, p: Record<string, string>, sig: string, secret: string) {
  const payload =
    url +
    Object.keys(p)
      .sort()
      .map((k) => k + p[k])
      .join("");
  const expected = createHmac("sha1", secret).update(payload).digest("base64");
  const a = Buffer.from(expected),
    b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const Route = createFileRoute("/api/public/integrations/twilio/sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const p = await form(request);
          const automation = await findAutomation(str(p.To));
          if (!automation) return new Response("Not found", { status: 404 });
          const { data: row, error } = await db2Admin
            .from("integration_connections")
            .select("credential_ciphertext,status")
            .eq("automation_id", String(automation.id))
            .eq("provider", "twilio")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!row || row.status !== "connected")
            return new Response("Not configured", { status: 503 });
          const c = JSON.parse(decryptSecret(String(row.credential_ciphertext))) as Record<
            string,
            unknown
          >;
          const sig = request.headers.get("x-twilio-signature") || "";
          const url = `${process.env.VITE_APP_URL || new URL(request.url).origin}/api/public/integrations/twilio/sms`;
          if (!valid(url, p, sig, str(c.authToken)))
            return new Response("Forbidden", { status: 403 });
          const ctx = {
            exec: {
              id: `sms-${p.MessageSid || crypto.randomUUID()}`,
              automation_id: String(automation.id),
              client_id: String(automation.client_id),
              automation_kind: "ai_receptionist" as const,
              input: {},
              timeout_seconds: 60,
              attempt_count: 1,
              max_attempts: 1,
            },
            automation,
          };
          const result = await runReceptionistTurn(ctx, {
            channel: "sms",
            from: str(p.From),
            body: str(p.Body),
            message_id: str(p.MessageSid),
          });
          if (result.reply && result.message_id) {
            const sent = await sendTwilioMessage({
              automationId: String(automation.id),
              to: str(p.From),
              body: result.reply,
            });
            await markMessageDelivered(result.message_id, sent);
          }
          return new Response("OK", { status: 200 });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Internal error", { status: 500 });
        }
      },
    },
  },
});
