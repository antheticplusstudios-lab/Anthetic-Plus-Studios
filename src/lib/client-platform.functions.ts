import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantActive } from "@/server/auth/tenant.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { normalizeWidgetConfig } from "@/lib/widget-config";

const automationIdSchema = z.object({ automationId: z.string().uuid() });

async function assertOwnAutomation(context: any, automationId: string) {
  assertTenantActive(context.tenant);
  const { data, error } = await db2Admin
    .from("client_automations")
    .select("*")
    .eq("id", automationId)
    .eq("client_id", context.tenant.clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Automation not found.");
  return data;
}

export const getMyAccountContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    userId: context.tenant.userId,
    organizationId: context.tenant.organizationId,
    clientId: context.tenant.clientId,
    role: context.tenant.role,
    isStaff: context.tenant.isStaff,
    isPlatformAdmin: context.tenant.isPlatformAdmin,
    isSuperAdmin: context.tenant.isSuperAdmin,
    isBanned: context.tenant.isBanned,
    isSuspended: context.tenant.isSuspended,
    isMuted: context.tenant.isMuted,
    roles: context.tenant.roles,
  }));

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await db1Admin.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    full_name: z.string().trim().min(2).max(120),
    company_name: z.string().trim().min(1).max(160),
    company_email: z.string().trim().email().max(254),
    website_url: z.string().trim().min(4).max(500),
    category: z.string().trim().min(1).max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    assertTenantActive(context.tenant);
    const payload = {
      full_name: data.full_name,
      company_name: data.company_name,
      company_email: data.company_email,
      website_url: data.website_url,
      category: data.category,
      registered_origin_domain: new URL(/^https?:\/\//i.test(data.website_url) ? data.website_url : `https://${data.website_url}`).hostname.toLowerCase().replace(/^www\./, ""),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db1Admin.from("profiles").update(payload).eq("id", context.userId);
    if (error) throw new Error(error.message);
    await db1Admin.from("organizations").update({ name: data.company_name, updated_at: new Date().toISOString() }).eq("id", context.tenant.organizationId);
    return { ok: true, profile_completed: true };
  });

export const getActivePaymentMethods = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await db2Admin.from("payment_methods").select("*").eq("is_active", true).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertTenantActive(context.tenant);
    const [{ data: orders, error }, { data: payments }] = await Promise.all([
      db2Admin.from("orders").select(ORDER_SELECT as "*").eq("client_id", context.tenant.clientId).order("created_at", { ascending: false }),
      db2Admin.from("payment_verifications").select("id,order_id,amount,status,rejection_reason,transaction_id,sender_name,payment_method_id,created_at,verified_at,payment_methods(method_name)").eq("client_id", context.tenant.clientId).order("created_at", { ascending: false }),
    ]);
    if (error) throw new Error(error.message);
    const orderRows = orders ?? [];
    const paymentRows = payments ?? [];
    const paymentByOrder = new Map<string, any>();
    for (const p of paymentRows) if (!paymentByOrder.has(p.order_id)) paymentByOrder.set(p.order_id, p);
    return orderRows.map((o: any) => {
      const payment = paymentByOrder.get(o.id);
      return {
        ...o,
        automation_id: null,
        submitted_at: payment?.created_at ?? o.created_at,
        automation_slug: o.automation_type,
        billing_plan: o.pricing_snapshot?.plan ?? "monthly",
        amount: payment?.amount ?? o.total_amount,
        payment_method: payment?.payment_methods?.method_name ?? o.payment_methods?.method_name ?? "",
        transaction_id: payment?.transaction_id ?? "",
        sender_name: payment?.sender_name ?? "",
        rejection_reason: payment?.rejection_reason ?? o.rejection_reason ?? null,
        payment_status: payment?.status ?? o.status,
        payment_id: payment?.id ?? null,
      };
    });
  });
export const getMyAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertTenantActive(context.tenant);
    const [{ data: autos, error }, { data: subs }, { data: convs }, { data: leads }, { data: aiConfigs }] = await Promise.all([
      db2Admin.from("client_automations").select("*").eq("client_id", context.tenant.clientId).order("created_at", { ascending: false }),
      db2Admin.from("subscriptions").select("id,automation_id,plan_slug,status,expires_at,grace_period_end").eq("client_id", context.tenant.clientId),
      db4Admin.from("conversations").select("automation_id"),
      db4Admin.from("leads").select("automation_id"),
      db3Admin.from("ai_configs").select("automation_id,system_prompt,behavior_config,status").eq("client_id", context.tenant.clientId),
    ]);
    if (error) throw new Error(error.message);
    const subByAuto = new Map((subs ?? []).map((x:any)=>[x.automation_id,x]));
    const aiByAuto = new Map((aiConfigs ?? []).map((x:any)=>[x.automation_id,x]));
    const convCounts = new Map<string,number>();
    const leadCounts = new Map<string,number>();
    for(const c of convs ?? []) convCounts.set(c.automation_id,(convCounts.get(c.automation_id)??0)+1);
    for(const l of leads ?? []) leadCounts.set(l.automation_id,(leadCounts.get(l.automation_id)??0)+1);
    return (autos ?? []).map((a:any)=>{
      const sub=subByAuto.get(a.id); const ai=aiByAuto.get(a.id);
      let status=String(a.run_state);
      if(status==="active" && sub?.status==="trialing") status="paid";
      if(status==="stopped" || status==="disabled") status="revoked";
      return {
        ...a, automation_slug:a.automation_type, website_domain:a.domain_url, status, killed: ["stopped","disabled"].includes(String(a.run_state)),
        billing_plan: sub?.plan_slug ?? "monthly", warning_sent:false, grace_days: sub?.grace_period_end ? Math.max(0,Math.ceil((new Date(sub.grace_period_end).getTime()-Date.now())/86400000)) : 0,
        conversations_count:convCounts.get(a.id)??0, leads_count:leadCounts.get(a.id)??0, business_context:String(ai?.behavior_config?.business_context??""), system_prompt:String(ai?.system_prompt??""),
        subscription_status:sub?.status??null, subscription_expires_at:sub?.expires_at??a.expires_at, script_token:"",
      };
    });
  });

export const generateMyInstallScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => automationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const { data: token, error } = await db2Admin.rpc("generate_automation_token", {
      p_automation_id: automation.id,
      p_generated_by: context.userId,
    });
    if (error || !token) throw new Error(error?.message ?? "Could not generate installation token.");
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = (process.env.VITE_APP_URL || process.env.APP_URL || "").replace(/\/$/, "") || new URL(getRequest().url).origin;
    const src = `${origin}/widget.js`;
    const snippet = `<script src="${src}" data-client-id="${automation.client_id}" data-automation-id="${automation.id}" data-token="${String(token)}" defer></script>`;
    await db2Admin.from("client_automations").update({ requires_reinstallation: false }).eq("id", automation.id);
    await auditMutation(context, { action: "automation.install_script.generated", targetId: automation.id, targetType: "automation", after: { token_last4: String(token).slice(-4) } });
    return { snippet, token: String(token), automationId: automation.id, domain: automation.domain_url };
  });

export const getMyAutomationPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => automationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const [subscription, usage, conversations, knowledge, crawlJobs, tasks, integrations] = await Promise.all([
      automation.subscription_id ? db2Admin.from("subscriptions").select("*").eq("id", automation.subscription_id).maybeSingle() : Promise.resolve({ data: null }),
      db2Admin.from("usage_meters").select("*").eq("automation_id", automation.id).eq("billing_period", new Date().toISOString().slice(0,7)).maybeSingle(),
      db4Admin.from("conversations").select("*").eq("automation_id", automation.id).order("created_at", { ascending: false }).limit(100),
      db3Admin.from("kb_documents").select("id, source_type, source_name, canonical_url, priority, status, created_at").eq("automation_id", automation.id).order("created_at", { ascending: false }),
      db3Admin.from("crawl_jobs").select("*").eq("automation_id", automation.id).order("created_at", { ascending: false }).limit(5),
      db2Admin.from("automation_tasks").select("*").eq("automation_id", automation.id).order("created_at"),
      db2Admin.from("integration_connections").select("provider,status,updated_at,last_verified_at,last_error").eq("automation_id", automation.id),
    ]);
    return {
      automation,
      subscription: subscription.data ?? null,
      usage: usage.data ?? null,
      conversations: conversations.data ?? [],
      knowledge: knowledge.data ?? [],
      crawlJobs: crawlJobs.data ?? [],
      tasks: tasks.data ?? [],
      integrations: integrations.data ?? [],
    };
  });

export const getConversationMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ conversationId: z.string().uuid(), automationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { data: conversation, error: cErr } = await db4Admin.from("conversations").select("id,automation_id,client_id").eq("id", data.conversationId).eq("automation_id", data.automationId).eq("client_id", context.tenant.clientId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conversation) throw new Error("Conversation not found.");
    const { data: messages, error } = await db4Admin.from("messages").select("*").eq("conversation_id", data.conversationId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return messages ?? [];
  });

export const updateAutomationTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ automationId: z.string().uuid(), taskKey: z.string().trim().min(1).max(100), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { error } = await db2Admin.from("automation_tasks").upsert({ automation_id: data.automationId, task_key: data.taskKey, enabled: data.enabled }, { onConflict: "automation_id,task_key" });
    if (error) throw new Error(error.message);
    await auditMutation(context, { action: "automation.task.updated", targetId: data.automationId, targetType: "automation", after: { task_key: data.taskKey, enabled: data.enabled } });
    return { ok: true };
  });

export const saveClientWidgetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ automationId: z.string().uuid(), config: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const canonical = normalizeWidgetConfig(data.config);
    const version = Number(automation.widget_config_version ?? 0) + 1;
    const { error } = await db2Admin.from("client_automations").update({ widget_config: canonical, widget_config_version: version, updated_at: new Date().toISOString() }).eq("id", data.automationId).eq("client_id", context.tenant.clientId);
    if (error) throw new Error(error.message);
    await auditMutation(context, { action: "automation.widget.updated", targetId: data.automationId, targetType: "automation", after: { widget_config_version: version, style: canonical.style } });
    return { ok: true, version };
  });

export const createCrawlJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ automationId: z.string().uuid(), url: z.string().url().max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const { data: kb } = await db3Admin.from("knowledge_bases").select("id").eq("automation_id", automation.id).maybeSingle();
    const { data: job, error } = await db3Admin.from("crawl_jobs").insert({ client_id: context.tenant.clientId, automation_id: automation.id, knowledge_base_id: kb?.id ?? null, target_url: data.url, status: "pending" }).select("*").single();
    if (error) throw new Error(error.message);
    return job;
  });

export const deleteKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ automationId: z.string().uuid(), documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { error } = await db3Admin.from("kb_documents").delete().eq("id", data.documentId).eq("automation_id", data.automationId).eq("client_id", context.tenant.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveManualKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ automationId: z.string().uuid(), sourceName: z.string().min(1).max(240), content: z.string().min(1).max(200000), sourceType: z.enum(["manual_text","pdf_upload"]).default("manual_text") }).parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const { data: kb } = await db3Admin.from("knowledge_bases").select("id").eq("automation_id", automation.id).maybeSingle();
    if (!kb?.id) throw new Error("Knowledge base is not initialized yet.");
    const { data: doc, error } = await db3Admin.from("kb_documents").insert({ knowledge_base_id: kb.id, client_id: context.tenant.clientId, automation_id: automation.id, source_type: data.sourceType, source_name: data.sourceName, content: data.content, status: "pending" }).select("id,source_type,source_name,created_at,status").single();
    if (error) throw new Error(error.message);
    return doc;
  });

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => automationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { data: rows, error } = await db2Admin.from("integration_connections").select("provider,status,updated_at,last_verified_at,last_error,scopes").eq("automation_id", data.automationId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const submitRenewalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ automationId: z.string().uuid(), paymentMethod: z.string().min(1).max(120), transactionId: z.string().trim().min(3).max(200), senderName: z.string().trim().min(2).max(160), amount: z.number().min(0).max(100000) }).parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const { data: order } = await db2Admin.from("orders").select("id").eq("id", automation.order_id).eq("client_id", context.tenant.clientId).maybeSingle();
    if (!order?.id) throw new Error("Original order not found.");
    const { data: method } = await db2Admin.from("payment_methods").select("id,method_name").eq("method_name", data.paymentMethod).maybeSingle();
    const { error: paymentError } = await db2Admin.from("payment_verifications").insert({ order_id: order.id, client_id: context.tenant.clientId, submitted_by_user_id: context.userId, payment_method_id: method?.id ?? null, transaction_id: data.transactionId, sender_name: data.senderName, amount: data.amount, status: "pending" });
    if (paymentError) throw new Error(paymentError.message);
    return { ok: true };
  });

export const submitOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    product: z.enum(["ai_receptionist","messaging_ai","ai_sales_agent","workflow_automation","lead_capture","kb_support"]),
    deliveryChannel: z.string().max(80).default("web"),
    features: z.array(z.string().max(100)).max(100).default([]),
    fullName: z.string().trim().min(2).max(160),
    company: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(254),
    country: z.string().trim().min(2).max(120),
    target: z.string().trim().min(4).max(500),
    plan: z.enum(["monthly","yearly"]).default("monthly"),
    paymentMethodId: z.string().uuid(),
    transactionId: z.string().trim().min(3).max(200),
    senderName: z.string().trim().min(2).max(160),
    proof: z.record(z.string(), z.string()).default({}),
    promoCode: z.string().trim().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    assertTenantActive(context.tenant);
    const domain = new URL(/^https?:\/\//i.test(data.target) ? data.target : `https://${data.target}`).hostname.toLowerCase().replace(/^www\./, "");
    const { data: method } = await db2Admin.from("payment_methods").select("id,method_name,required_fields,is_active").eq("id", data.paymentMethodId).maybeSingle();
    if (!method?.is_active) throw new Error("Selected payment method is unavailable.");
    const { data: pricing } = await db2Admin.from("pricing_plans").select("monthly_price,yearly_price,yearly_discount_pct").eq("slug", data.product).eq("active", true).maybeSingle();
    if (!pricing) throw new Error("Pricing plan is not available.");
    const base = data.plan === "yearly" ? Number(pricing.yearly_price ?? (Number(pricing.monthly_price) * 12 * (1 - Number(pricing.yearly_discount_pct ?? 0) / 100))) : Number(pricing.monthly_price);
    let total = base;
    let promoPercent = 0;
    if (data.promoCode) {
      const { data: promo } = await db2Admin.from("promo_codes").select("percent_off,active,expires_at").eq("code", data.promoCode.toUpperCase()).maybeSingle();
      if (promo?.active && (!promo.expires_at || new Date(promo.expires_at).getTime() > Date.now())) {
        promoPercent = Number(promo.percent_off ?? 0);
        total = Math.round(total * (1 - promoPercent / 100) * 100) / 100;
      }
    }
    const orderPayload = {
      client_id: context.tenant.clientId,
      user_id: context.userId,
      order_number: newOrderNumber(),
      product_type: data.product,
      product_name: data.product,
      total_amount: total,
      currency: "USD",
      status: orderStatusToDb("pending_verification"),
      submitted_at: new Date().toISOString(),
      metadata: {
        delivery_channel: data.deliveryChannel, selected_features: data.features,
        pricing_snapshot: { plan: data.plan, base, promo_code: promoPercent ? data.promoCode?.toUpperCase() : null, promo_percent: promoPercent },
        full_name: data.fullName, company_name: data.company, contact_email: data.email, country: data.country,
        target_domain_url: data.target, origin_domain: domain, payment_method_id: method.id,
      },
    };
    const { data: order, error } = await db2Admin.from("orders").insert(orderPayload).select("id,order_id:order_number,total_amount").single();
    if (error) throw new Error(error.message);
    const { error: verifyError } = await db2Admin.from("payment_verifications").insert({ order_id: order.id, client_id: context.tenant.clientId, submitted_by_user_id: context.userId, payment_method_id: method.id, transaction_id: data.transactionId, sender_name: data.senderName, proof_data: data.proof, amount: total, currency: "USD", status: "pending" });
    if (verifyError) throw new Error(verifyError.message);
    await db2Admin.rpc("enqueue_outbox", { p_event_type: "order.created", p_aggregate_type: "order", p_aggregate_id: order.id, p_idempotency_key: `order.created:${order.id}`, p_payload: { order_id: order.id, client_id: context.tenant.clientId } });
    return { ok: true, orderId: order.order_id, total };
  });
