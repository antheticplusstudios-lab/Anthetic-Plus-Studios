import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db2Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";
import { runReceptionistTurn } from "@/lib/automation-engine.server";

type R = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const esc = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const phoneFromHandoff = (v: unknown) => {
  const m = String(v ?? "").match(/\+?[1-9]\d{6,14}/);
  return m?.[0] ?? "";
};
const xml = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });

async function findAutomation(to: string) {
  const { data, error } = await db2Admin
    .from("client_automations")
    .select(
      "id,client_id,automation_type,product_type,status,run_state,enabled,is_active,expires_at,config,metadata",
    )
    .eq("metadata->>assigned_phone_number", to)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as R | null;
}

async function twilioToken(automationId: string) {
  const { data, error } = await db2Admin
    .from("integration_connections")
    .select("credential_ciphertext,status")
    .eq("automation_id", automationId)
    .eq("provider", "twilio")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== "connected") throw new Error("Twilio integration is not connected.");
  const c = JSON.parse(decryptSecret(String(data.credential_ciphertext))) as R;
  return {
    accountSid: str(c.accountSid),
    authToken: str(c.authToken),
    apiKeySecret: str(c.apiKeySecret),
    fromNumber: str(c.fromNumber),
  };
}

function validSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  secret: string,
) {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = createHmac("sha1", secret).update(payload).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function form(request: Request) {
  const fd = await request.formData();
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

export const Route = createFileRoute("/api/public/integrations/twilio/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const p = await form(request);
          const to = str(p.To);
          const automation = await findAutomation(to);
          if (!automation) return new Response("Not found", { status: 404 });
          const creds = await twilioToken(String(automation.id));
          const signature = request.headers.get("x-twilio-signature") || "";
          const url = `${process.env.VITE_APP_URL || new URL(request.url).origin}/api/public/integrations/twilio/voice`;
          if (!signature || !validSignature(url, p, signature, creds.authToken))
            return new Response("Forbidden", { status: 403 });
          const speech = str(p.SpeechResult);
          const from = str(p.From);
          if (!speech)
            return xml(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" method="POST" speechTimeout="auto" language="en-US"><Say>Hi, thanks for calling. How can I help you today?</Say></Gather><Say>I didn't hear anything. Goodbye.</Say><Hangup/></Response>`,
            );
          const ctx = {
            exec: {
              id: `voice-${p.CallSid || crypto.randomUUID()}`,
              automation_id: String(automation.id),
              client_id: String(automation.client_id),
              automation_kind: "ai_receptionist" as const,
              input: {},
              timeout_seconds: 30,
              attempt_count: 1,
              max_attempts: 1,
            },
            automation,
          };
          const result = await runReceptionistTurn(ctx, {
            channel: "voice",
            from,
            body: speech,
            message_id: `${p.CallSid || "call"}:${Date.now()}`,
          });
          if (result.escalated) {
            const handoff = phoneFromHandoff(
              (automation.config as R)?.settings &&
                ((automation.config as R).settings as R).handoff_contact,
            );
            if (handoff)
              return xml(
                `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please hold while I connect you with a member of the team.</Say><Dial timeout="25">${esc(handoff)}</Dial><Say>The team member could not be reached. We have recorded your request and will follow up.</Say><Hangup/></Response>`,
              );
            return xml(
              `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please hold while I connect you with a member of the team.</Say><Pause length="5"/><Say>The team member is unavailable. We have recorded your request and will follow up.</Say><Hangup/></Response>`,
            );
          }
          return xml(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" method="POST" speechTimeout="auto" language="en-US"><Say>${esc(String(result.reply || "Sorry, I couldn't answer that right now."))}</Say></Gather><Say>Thanks for calling. Goodbye.</Say><Hangup/></Response>`,
          );
        } catch (e) {
          return xml(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${esc(e instanceof Error ? e.message.slice(0, 240) : "The assistant is temporarily unavailable.")}</Say><Hangup/></Response>`,
          );
        }
      },
    },
  },
});
