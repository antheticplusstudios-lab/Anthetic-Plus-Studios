/**
 * Receptionist service matcher: a caller describes what they need, the model picks one of the
 * client's own configured services and drafts booking details. Nothing is booked or saved here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const matchServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ automationId: z.string().uuid(), description: z.string().trim().min(5).max(1000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db2Admin } = await import("@/server/db/clients.server");
    const { data: row, error: e2 } = await db2Admin
      .from("client_automations")
      .select("id,client_id,automation_type,product_type,config")
      .eq("id", data.automationId)
      .maybeSingle();
    if (e2) throw new Error("Could not load this automation.");
    if (!row) throw new Error("Automation not found.");
    // Same error for "missing" and "someone else's" so tenants can't probe ids.
    const { assertTenantActive } = await import("@/lib/rbac.server");
    assertTenantActive(context as never);
    if (!context.tenant.clientId || String(row.client_id) !== context.tenant.clientId)
      throw new Error("Automation not found.");
    const type = String(row.automation_type ?? row.product_type ?? "");
    if (type !== "ai_receptionist" && type !== "voice-sms-receptionist")
      throw new Error("Service matching is only available for the AI Receptionist.");

    const { parseServices, normalizeDraft } = await import("@/lib/service-match");
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const settings = (cfg["settings"] ?? {}) as Record<string, unknown>;
    const services = parseServices(settings["services"]);
    if (services.length === 0)
      return { status: "not_configured" as const, services: [], draft: null };

    const { routeChat } = await import("@/lib/llm-router.server");
    const today = new Date().toISOString().slice(0, 10);
    const r = await routeChat(
      [
        {
          role: "system",
          content:
            `You are a receptionist preparing a booking. Today is ${today}. The business offers ONLY these services:\n` +
            services.map((s) => `- ${s}`).join("\n") +
            `\n\nPick the single best service, copying its name exactly, or null if none fits. Never invent services, prices or availability. ` +
            `Extract only details the caller actually said. List missing details and up to 3 short follow-up questions. ` +
            `Return ONLY json: {"service": string|null, "confidence": "high"|"medium"|"low", "reason": string, "alternatives": string[], ` +
            `"details": {"preferredDate": string|null, "preferredTime": string|null, "people": number|null, "location": string|null, "notes": string|null}, ` +
            `"missing": string[], "questions": string[]}`,
        },
        { role: "user", content: data.description },
      ],
      {
        automationId: String(row.id),
        clientId: String(row.client_id),
        maxTokens: 600,
        temperature: 0.1,
        jsonMode: true,
      },
    );
    if (!r) return { status: "ai_unavailable" as const, services, draft: null };
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(r.reply.replace(/^```(?:json)?|```$/g, "").trim());
    } catch {
      parsed = null;
    }
    return { status: "ok" as const, services, draft: normalizeDraft(services, parsed) };
  });
