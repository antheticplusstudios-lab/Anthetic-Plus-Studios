import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertOwner } from "./rbac.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { encryptSecret } from "@/server/security/envelope.server";
import { routeChat } from "@/lib/llm-router.server";

const ASSISTANT_LABEL = "Control Center Assistant";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

type KeyRow = {
  id: string;
  provider_key: string;
  label: string;
  key_hint: string;
  model: string | null;
  priority: number;
  is_active: boolean;
};

function mask(value: string) {
  if (value.length <= 10) return "••••";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function assistantKey(): Promise<KeyRow | null> {
  const { data, error } = await db3Admin
    .from("llm_api_keys")
    .select("id,provider_key,label,key_hint,model,priority,is_active")
    .eq("label", ASSISTANT_LABEL)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as KeyRow | null;
}

export const assistantStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const key = await assistantKey();
    return {
      configured: !!key,
      hint: key?.key_hint ?? "",
      model: key?.model ?? DEFAULT_MODEL,
      provider: key?.provider_key ?? "openrouter",
    };
  });

export const saveAssistantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      keyValue: z.string().max(500).optional(),
      model: z.string().max(160).optional(),
      clearKey: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    assertOwner(context);
    const current = await assistantKey();
    if (data.clearKey) {
      const { error } = await db3Admin.from("llm_api_keys").delete().eq("label", ASSISTANT_LABEL);
      if (error) throw new Error(error.message);
    } else if (data.keyValue?.trim()) {
      const value = data.keyValue.trim();
      const hint = mask(value);
      const payload = {
        provider_key: "openrouter",
        label: ASSISTANT_LABEL,
        key_hint: hint,
        key_ciphertext: encryptSecret(value),
        model: data.model?.trim() || current?.model || DEFAULT_MODEL,
        priority: 0,
        is_active: true,
      };
      const result = current
        ? await db3Admin.from("llm_api_keys").update(payload).eq("id", current.id)
        : await db3Admin.from("llm_api_keys").insert(payload);
      if (result.error) throw new Error(result.error.message);
    } else if (data.model?.trim() && current) {
      const { error } = await db3Admin.from("llm_api_keys").update({ model: data.model.trim() }).eq("id", current.id);
      if (error) throw new Error(error.message);
    }
    await auditMutation(context, {
      action: "assistant.settings.updated",
      targetType: "llm_assistant",
      after: { configured: !!(await assistantKey()), model: data.model?.trim() || current?.model || DEFAULT_MODEL },
    });
    const key = await assistantKey();
    return { configured: !!key, hint: key?.key_hint ?? "", model: key?.model ?? DEFAULT_MODEL };
  });

async function snapshot() {
  const [profiles, automations, orders, subscriptions, requests, conversations, plans] = await Promise.all([
    db1Admin.from("profiles").select("id,client_id,company_name,website_url,category,profile_completed").limit(500),
    db2Admin.from("client_automations").select("id,client_id,automation_type,name,domain_url,run_state,is_active,expires_at,requires_reinstallation,created_at").limit(500),
    db2Admin.from("orders").select(ORDER_SELECT as "*").order("created_at", { ascending: false }).limit(100),
    db2Admin.from("subscriptions").select("automation_id,status,plan_slug,expires_at,grace_period_end").limit(500),
    db3Admin.from("llm_requests").select("automation_id,provider_key,model,status,tokens_in,tokens_out,created_at").order("created_at", { ascending: false }).limit(500),
    db4Admin.from("conversations").select("automation_id,channel,status,created_at,last_message_at").order("created_at", { ascending: false }).limit(500),
    db2Admin.from("pricing_plans").select("slug,monthly_price,yearly_price,active,listed").eq("active", true).limit(100),
  ]);
  for (const r of [profiles, automations, orders, subscriptions, requests, conversations, plans]) if ((r as any).error) throw new Error((r as any).error.message);
  const subByAuto = new Map((subscriptions.data ?? []).map((x: any) => [x.automation_id, x]));
  const price = new Map((plans.data ?? []).map((x: any) => [x.slug, Number(x.monthly_price)]));
  const lines = [
    `TODAY: ${new Date().toISOString()}`,
    `Clients: ${(profiles.data ?? []).length}. Automations: ${(automations.data ?? []).length}. Conversations: ${(conversations.data ?? []).length}. Orders: ${(orders.data ?? []).length}.`,
    `AI requests: ${(requests.data ?? []).length}. Estimated monthly run-rate from active automations: $${(automations.data ?? []).filter((a:any)=>a.run_state==='active'&&a.is_active).reduce((s:number,a:any)=>s+(price.get(a.automation_type)||0),0).toLocaleString('en-US')}.`,
    "AUTOMATIONS:",
    ...(automations.data ?? []).slice(0, 40).map((a: any) => {
      const sub = subByAuto.get(a.id);
      return `- ${a.id} | ${a.name || a.automation_type} | ${a.run_state} | ${a.domain_url} | ${sub?.status ?? "no_subscription"} | expires ${sub?.expires_at ?? a.expires_at ?? "—"} | reinstall ${!!a.requires_reinstallation}`;
    }),
    "RECENT ORDERS:",
    ...(orders.data ?? []).slice(0, 30).map((o: any) => `- ${o.order_id} | ${o.automation_type} | $${o.total_amount} | ${o.status} | ${o.created_at}`),
    "RECENT AI FAILURES:",
    ...(requests.data ?? []).filter((r:any)=>r.status !== "success").slice(0, 30).map((r:any) => `- ${r.provider_key}/${r.model} | ${r.status} | ${r.automation_id ?? "platform"} | ${r.created_at}`),
  ];
  return lines.join("\n");
}

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ question: z.string().min(3).max(600) }).parse(input))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const key = await assistantKey();
    if (!key) throw new Error("Add the Control Center Assistant key on the Infrastructure page first.");
    const dataSnapshot = await snapshot();
    const routed = await routeChat([
      {
        role: "system",
        content: "You are the AntheticPlus Studios Control Center assistant. Use ONLY the supplied platform snapshot. Never invent names, amounts, dates or statuses. If the snapshot cannot answer the question, say so and identify the relevant Control Center area. Keep the response to 2-5 short sentences followed by up to 3 concise next actions.",
      },
      { role: "system", content: `PLATFORM SNAPSHOT\n${dataSnapshot}` },
      { role: "user", content: data.question },
    ], { maxTokens: 700, temperature: 0.2, clientId: context.tenant.clientId }, db3Admin);
    if (!routed) throw new Error("The configured AI providers are unavailable right now.");
    await auditMutation(context, {
      action: "assistant.query",
      targetType: "llm_assistant",
      after: { provider: routed.provider, model: routed.model, question: data.question.slice(0, 200) },
    });
    return { answer: routed.reply, model: routed.model, provider: routed.provider };
  });
