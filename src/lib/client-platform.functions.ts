import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantActive } from "@/server/auth/tenant.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { normalizeWidgetConfig } from "@/lib/widget-config";
import type { TenantContext } from "@/server/auth/tenant.server";
import type { DB2Database, DB3Database, DB4Database } from "@/server/db/server-db.types";

const automationIdSchema = z.object({ automationId: z.string().uuid() });

async function assertOwnAutomation(context: { tenant: TenantContext }, automationId: string) {
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
    const { data, error } = await db1Admin
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(120),
        company_name: z.string().trim().min(1).max(160),
        company_email: z.string().trim().email().max(254),
        website_url: z.string().trim().min(4).max(500),
        category: z.string().trim().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertTenantActive(context.tenant);
    const payload = {
      full_name: data.full_name,
      company_name: data.company_name,
      company_email: data.company_email,
      website_url: data.website_url,
      category: data.category,
      registered_origin_domain: new URL(
        /^https?:\/\//i.test(data.website_url) ? data.website_url : `https://${data.website_url}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, ""),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db1Admin.from("profiles").update(payload).eq("id", context.userId);
    if (error) throw new Error(error.message);
    await db1Admin
      .from("organizations")
      .update({ name: data.company_name, updated_at: new Date().toISOString() })
      .eq("id", context.tenant.organizationId);
    return { ok: true, profile_completed: true };
  });

export const getActivePaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await db2Admin
    .from("payment_methods")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {};
    const instructions =
      "instructions" in meta && typeof meta.instructions === "string" ? meta.instructions : "";
    const fields =
      "required_fields" in meta && Array.isArray(meta.required_fields)
        ? meta.required_fields.filter((field): field is string => typeof field === "string")
        : [];
    return {
      ...row,
      method_name: row.account_name ?? row.provider_name ?? row.method_type,
      instructions,
      required_fields: fields,
      is_card: row.method_type === "card",
    };
  });
});

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertTenantActive(context.tenant);
    const { data: orders, error } = await db2Admin
      .from("orders")
      .select("*")
      .eq("client_id", context.tenant.clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const orderRows = orders ?? [];
    const orderIds = orderRows.map((order) => order.id);
    if (!orderIds.length) return [];

    const { data: payments, error: paymentError } = await db2Admin
      .from("payment_verifications")
      .select(
        "id,order_id,amount,status,notes,trx_id,sender_phone,payment_method_id,metadata,created_at,reviewed_at",
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });
    if (paymentError) throw new Error(paymentError.message);

    const methodIds = [
      ...new Set(
        (payments ?? [])
          .map((payment) => payment.payment_method_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: methods, error: methodsError } = methodIds.length
      ? await db2Admin
          .from("payment_methods")
          .select("id,account_name,method_type")
          .in("id", methodIds)
      : { data: [], error: null };
    if (methodsError) throw new Error(methodsError.message);

    const paymentByOrder = new Map<string, NonNullable<typeof payments>[number]>();
    for (const payment of payments ?? [])
      if (!paymentByOrder.has(payment.order_id)) paymentByOrder.set(payment.order_id, payment);
    const methodMap = new Map(
      (methods ?? []).map((method) => [
        method.id,
        method.account_name ?? method.method_type ?? "Payment",
      ]),
    );

    return orderRows.map((order) => {
      const normalized = normalizeOrder(order);
      const payment = paymentByOrder.get(order.id);
      const metadata =
        order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
          ? (order.metadata as Record<string, unknown>)
          : {};
      const pricing =
        metadata.pricing_snapshot &&
        typeof metadata.pricing_snapshot === "object" &&
        !Array.isArray(metadata.pricing_snapshot)
          ? (metadata.pricing_snapshot as Record<string, unknown>)
          : {};
      const paymentMetadata =
        payment?.metadata &&
        typeof payment.metadata === "object" &&
        !Array.isArray(payment.metadata)
          ? (payment.metadata as Record<string, unknown>)
          : {};
      return {
        ...order,
        automation_id: null,
        submitted_at: order.submitted_at ?? order.created_at,
        order_id: normalized.order_id,
        automation_type: normalized.automation_type,
        target_domain_url: normalized.target_domain_url,
        automation_slug: String(normalized.product_type ?? ""),
        billing_plan: String(pricing.plan ?? "monthly"),
        amount: payment?.amount ?? order.total_amount,
        payment_method: payment ? (methodMap.get(payment.payment_method_id ?? "") ?? "") : "",
        transaction_id: payment?.trx_id ?? "",
        sender_name: String(paymentMetadata.sender_name ?? ""),
        rejection_reason: payment?.notes ?? order.rejection_reason ?? null,
        payment_status: payment?.status ?? order.status,
        payment_id: payment?.id ?? null,
      };
    });
  });
export const getMyAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertTenantActive(context.tenant);
    const [{ data: autos, error }, { data: convs }, { data: leads }, { data: aiConfigs }] =
      await Promise.all([
        db2Admin
          .from("client_automations")
          .select("*")
          .eq("client_id", context.tenant.clientId)
          .order("created_at", { ascending: false }),
        db4Admin
          .from("conversations")
          .select("automation_id")
          .eq("client_id", context.tenant.clientId),
        db4Admin.from("leads").select("automation_id").eq("client_id", context.tenant.clientId),
        db3Admin
          .from("ai_configs")
          .select("automation_id,system_prompt,behavior_config,status")
          .eq("client_id", context.tenant.clientId),
      ]);
    if (error) throw new Error(error.message);

    const automationRows = autos ?? [];
    const subscriptionIds = [
      ...new Set(
        automationRows
          .map((automation) => automation.subscription_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: subs, error: subscriptionError } = subscriptionIds.length
      ? await db2Admin
          .from("subscriptions")
          .select("id,status,plan_code,current_period_end,grace_period_end")
          .in("id", subscriptionIds)
      : { data: [], error: null };
    if (subscriptionError) throw new Error(subscriptionError.message);

    const subByAuto = new Map(
      automationRows.map((automation) => [
        automation.id,
        subs?.find((subscription) => subscription.id === automation.subscription_id),
      ]),
    );
    const aiByAuto = new Map((aiConfigs ?? []).map((config) => [config.automation_id, config]));
    const convCounts = new Map<string, number>();
    const leadCounts = new Map<string, number>();
    for (const conversation of convs ?? [])
      convCounts.set(
        conversation.automation_id,
        (convCounts.get(conversation.automation_id) ?? 0) + 1,
      );
    for (const lead of leads ?? [])
      leadCounts.set(lead.automation_id, (leadCounts.get(lead.automation_id) ?? 0) + 1);

    return automationRows.map((automation) => {
      const subscription = subByAuto.get(automation.id);
      const ai = aiByAuto.get(automation.id);
      let status = String(automation.run_state || automation.status);
      if (status === "active" && subscription?.status === "trial") status = "trialing";
      if (["stopped", "disabled", "decommissioned"].includes(status)) status = "revoked";
      const automationMetadata =
        automation.metadata &&
        typeof automation.metadata === "object" &&
        !Array.isArray(automation.metadata)
          ? (automation.metadata as Record<string, unknown>)
          : {};
      const behavior =
        ai?.behavior_config &&
        typeof ai.behavior_config === "object" &&
        !Array.isArray(ai.behavior_config)
          ? (ai.behavior_config as Record<string, unknown>)
          : {};
      return {
        ...automation,
        automation_slug: automation.automation_type ?? automation.product_type,
        automation_type: automation.automation_type ?? automation.product_type,
        widget_config:
          automation.widget_config &&
          typeof automation.widget_config === "object" &&
          !Array.isArray(automation.widget_config)
            ? automation.widget_config
            : {},
        order_id:
          typeof automationMetadata.order_id === "string" ? automationMetadata.order_id : "",
        website_domain: automation.domain_url ?? automation.domain ?? "",
        domain_url: automation.domain_url ?? automation.domain ?? "",
        status,
        killed: ["stopped", "disabled", "expired", "decommissioned"].includes(
          String(automation.run_state),
        ),
        billing_plan: subscription?.plan_code ?? "monthly",
        warning_sent: false,
        grace_days: subscription?.grace_period_end
          ? Math.max(
              0,
              Math.ceil(
                (new Date(subscription.grace_period_end).getTime() - Date.now()) / 86400000,
              ),
            )
          : 0,
        conversations_count: convCounts.get(automation.id) ?? 0,
        leads_count: leadCounts.get(automation.id) ?? 0,
        business_context: String(behavior.business_context ?? ""),
        system_prompt: String(ai?.system_prompt ?? ""),
        subscription_status: subscription?.status ?? null,
        subscription_expires_at: automation.expires_at ?? subscription?.current_period_end ?? null,
        script_token: "",
        assigned_phone_number:
          typeof automationMetadata.assigned_phone_number === "string"
            ? automationMetadata.assigned_phone_number
            : null,
        webhook_url:
          typeof automationMetadata.webhook_url === "string"
            ? automationMetadata.webhook_url
            : null,
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
    if (error || !token)
      throw new Error(error?.message ?? "Could not generate installation token.");
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin =
      (process.env.VITE_APP_URL || process.env.APP_URL || "").replace(/\/$/, "") ||
      new URL(getRequest().url).origin;
    const src = `${origin}/widget.js`;
    const snippet = `<script src="${src}" data-client-id="${automation.client_id}" data-automation-id="${automation.id}" data-token="${String(token)}" defer></script>`;
    await db2Admin
      .from("client_automations")
      .update({ requires_reinstallation: false })
      .eq("id", automation.id);
    await auditMutation(context, {
      action: "automation.install_script.generated",
      targetId: automation.id,
      targetType: "automation",
      after: { token_last4: String(token).slice(-4) },
    });
    return {
      snippet,
      token: String(token),
      automationId: automation.id,
      domain: automation.domain_url,
    };
  });

export const getMyAutomationPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => automationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const [subscription, usage, conversations, knowledge, crawlJobs, tasks, integrations] =
      await Promise.all([
        automation.subscription_id
          ? db2Admin
              .from("subscriptions")
              .select("*")
              .eq("id", automation.subscription_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        db2Admin
          .from("usage_meters")
          .select("*")
          .eq("automation_id", automation.id)
          .eq("billing_period", new Date().toISOString().slice(0, 7))
          .maybeSingle(),
        db4Admin
          .from("conversations")
          .select("*")
          .eq("automation_id", automation.id)
          .order("created_at", { ascending: false })
          .limit(100),
        db3Admin
          .from("kb_documents")
          .select("id, source_type, source_name, canonical_url, priority, status, created_at")
          .eq("automation_id", automation.id)
          .order("created_at", { ascending: false }),
        db3Admin
          .from("crawl_jobs")
          .select("*")
          .eq("automation_id", automation.id)
          .order("created_at", { ascending: false })
          .limit(5),
        db2Admin
          .from("automation_tasks")
          .select("*")
          .eq("automation_id", automation.id)
          .order("created_at"),
        db2Admin
          .from("integration_connections")
          .select("provider,status,updated_at,last_verified_at,last_error")
          .eq("automation_id", automation.id),
      ]);
    const automationMetadata =
      automation.metadata &&
      typeof automation.metadata === "object" &&
      !Array.isArray(automation.metadata)
        ? automation.metadata
        : {};
    const portalAutomation = {
      ...automation,
      automation_type: automation.automation_type ?? automation.product_type,
      domain_url: automation.domain_url ?? automation.domain ?? "",
      order_id:
        "order_id" in automationMetadata && typeof automationMetadata.order_id === "string"
          ? automationMetadata.order_id
          : "",
      assigned_phone_number:
        "assigned_phone_number" in automationMetadata &&
        typeof automationMetadata.assigned_phone_number === "string"
          ? automationMetadata.assigned_phone_number
          : null,
      widget_config:
        automation.widget_config &&
        typeof automation.widget_config === "object" &&
        !Array.isArray(automation.widget_config)
          ? automation.widget_config
          : {},
    };
    return {
      automation: portalAutomation,
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
  .validator((d: unknown) =>
    z.object({ conversationId: z.string().uuid(), automationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { data: conversation, error: cErr } = await db4Admin
      .from("conversations")
      .select("id,automation_id,client_id")
      .eq("id", data.conversationId)
      .eq("automation_id", data.automationId)
      .eq("client_id", context.tenant.clientId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conversation) throw new Error("Conversation not found.");
    const { data: messages, error } = await db4Admin
      .from("messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return messages ?? [];
  });

export const updateAutomationTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        taskKey: z.string().trim().min(1).max(100),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { error } = await db2Admin
      .from("automation_tasks")
      .upsert(
        { automation_id: data.automationId, task_key: data.taskKey, enabled: data.enabled },
        { onConflict: "automation_id,task_key" },
      );
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "automation.task.updated",
      targetId: data.automationId,
      targetType: "automation",
      after: { task_key: data.taskKey, enabled: data.enabled },
    });
    return { ok: true };
  });

export const saveClientWidgetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ automationId: z.string().uuid(), config: z.record(z.string(), z.unknown()) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const canonical = normalizeWidgetConfig(data.config);
    const { error } = await db2Admin
      .from("client_automations")
      .update({ widget_config: canonical, updated_at: new Date().toISOString() })
      .eq("id", data.automationId)
      .eq("client_id", context.tenant.clientId);
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "automation.widget.updated",
      targetId: data.automationId,
      targetType: "automation",
      after: { style: canonical.style },
    });
    return { ok: true };
  });

export const createCrawlJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ automationId: z.string().uuid(), url: z.string().url().max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const { data: kb } = await db3Admin
      .from("knowledge_bases")
      .select("id")
      .eq("automation_id", automation.id)
      .maybeSingle();
    const { data: job, error } = await db3Admin
      .from("crawl_jobs")
      .insert({
        client_id: context.tenant.clientId,
        automation_id: automation.id,
        knowledge_base_id: kb?.id ?? null,
        target_url: data.url,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return job;
  });

export const deleteKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ automationId: z.string().uuid(), documentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { error } = await db3Admin
      .from("kb_documents")
      .delete()
      .eq("id", data.documentId)
      .eq("automation_id", data.automationId)
      .eq("client_id", context.tenant.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveManualKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        sourceName: z.string().min(1).max(240),
        content: z.string().min(1).max(200000),
        sourceType: z.enum(["manual_text", "pdf_upload"]).default("manual_text"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    const { data: kb } = await db3Admin
      .from("knowledge_bases")
      .select("id")
      .eq("automation_id", automation.id)
      .maybeSingle();
    if (!kb?.id) throw new Error("Knowledge base is not initialized yet.");
    const { data: doc, error } = await db3Admin
      .from("kb_documents")
      .insert({
        knowledge_base_id: kb.id,
        client_id: context.tenant.clientId,
        automation_id: automation.id,
        source_type: data.sourceType,
        source_name: data.sourceName,
        content: data.content,
        status: "pending",
      })
      .select("id,source_type,source_name,created_at,status")
      .single();
    if (error) throw new Error(error.message);
    return doc;
  });

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => automationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnAutomation(context, data.automationId);
    const { data: rows, error } = await db2Admin
      .from("integration_connections")
      .select("provider,status,updated_at,last_verified_at,last_error,scopes")
      .eq("automation_id", data.automationId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const submitRenewalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        paymentMethod: z.string().min(1).max(120),
        transactionId: z.string().trim().min(3).max(200),
        senderName: z.string().trim().min(2).max(160),
        amount: z.number().min(0).max(100000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const automation = await assertOwnAutomation(context, data.automationId);
    if (!automation.subscription_id) throw new Error("Subscription not found.");
    const { data: subscription, error: subscriptionError } = await db2Admin
      .from("subscriptions")
      .select("order_id")
      .eq("id", automation.subscription_id)
      .maybeSingle();
    if (subscriptionError) throw new Error(subscriptionError.message);
    if (!subscription?.order_id) throw new Error("Original order not found.");
    const { data: method } = await db2Admin
      .from("payment_methods")
      .select("id,account_name,is_active")
      .eq("id", data.paymentMethod)
      .maybeSingle();
    if (!method) {
      const { data: namedMethod } = await db2Admin
        .from("payment_methods")
        .select("id,account_name,is_active")
        .eq("account_name", data.paymentMethod)
        .maybeSingle();
      if (!namedMethod?.is_active) throw new Error("Selected payment method is unavailable.");
      const { error } = await db2Admin.from("payment_verifications").insert({
        order_id: subscription.order_id,
        payment_method_id: namedMethod.id,
        sender_phone: null,
        trx_id: data.transactionId,
        amount: data.amount,
        status: "pending",
        notes: data.senderName,
        metadata: { sender_name: data.senderName, source: "renewal" },
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    if (!method.is_active) throw new Error("Selected payment method is unavailable.");
    const { error } = await db2Admin.from("payment_verifications").insert({
      order_id: subscription.order_id,
      payment_method_id: method.id,
      sender_phone: null,
      trx_id: data.transactionId,
      amount: data.amount,
      status: "pending",
      notes: data.senderName,
      metadata: { sender_name: data.senderName, source: "renewal" },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const submitOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        product: z.enum([
          "ai_receptionist",
          "messaging_ai",
          "ai_sales_agent",
          "workflow_automation",
          "lead_capture",
          "kb_support",
        ]),
        deliveryChannel: z.string().max(80).default("web"),
        features: z.array(z.string().max(100)).max(100).default([]),
        fullName: z.string().trim().min(2).max(160),
        company: z.string().trim().min(1).max(160),
        email: z.string().trim().email().max(254),
        country: z.string().trim().min(2).max(120),
        target: z.string().trim().min(4).max(500),
        plan: z.enum(["monthly", "yearly"]).default("monthly"),
        paymentMethodId: z.string().uuid(),
        transactionId: z.string().trim().min(3).max(200),
        senderName: z.string().trim().min(2).max(160),
        proof: z.record(z.string(), z.string()).default({}),
        promoCode: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertTenantActive(context.tenant);
    const domain = new URL(
      /^https?:\/\//i.test(data.target) ? data.target : `https://${data.target}`,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    const { data: method } = await db2Admin
      .from("payment_methods")
      .select("id,method_type,provider_name,account_name,account_identifier,is_active,metadata")
      .eq("id", data.paymentMethodId)
      .maybeSingle();
    if (!method?.is_active) throw new Error("Selected payment method is unavailable.");
    const { data: pricing } = await db2Admin
      .from("pricing_plans")
      .select("monthly_price,yearly_price,yearly_discount_pct")
      .eq("slug", data.product)
      .eq("active", true)
      .maybeSingle();
    if (!pricing) throw new Error("Pricing plan is not available.");
    const base =
      data.plan === "yearly"
        ? Number(
            pricing.yearly_price ??
              Number(pricing.monthly_price) *
                12 *
                (1 - Number(pricing.yearly_discount_pct ?? 0) / 100),
          )
        : Number(pricing.monthly_price);
    let total = base;
    let promoPercent = 0;
    if (data.promoCode) {
      const { data: promo } = await db2Admin
        .from("promo_codes")
        .select("percent_off,active,expires_at")
        .eq("code", data.promoCode.toUpperCase())
        .maybeSingle();
      if (
        promo?.active &&
        (!promo.expires_at || new Date(promo.expires_at).getTime() > Date.now())
      ) {
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
        delivery_channel: data.deliveryChannel,
        selected_features: data.features,
        pricing_snapshot: {
          plan: data.plan,
          base,
          promo_code: promoPercent ? data.promoCode?.toUpperCase() : null,
          promo_percent: promoPercent,
        },
        full_name: data.fullName,
        company_name: data.company,
        contact_email: data.email,
        country: data.country,
        target_domain_url: data.target,
        origin_domain: domain,
        payment_method_id: method.id,
      },
    };
    const { data: order, error } = await db2Admin
      .from("orders")
      .insert(orderPayload)
      .select("id,order_id:order_number,total_amount")
      .single();
    if (error) throw new Error(error.message);
    const { error: verifyError } = await db2Admin.from("payment_verifications").insert({
      order_id: order.id,
      payment_method_id: method.id,
      sender_phone: null,
      trx_id: data.transactionId,
      amount: total,
      status: "pending",
      notes: data.senderName,
      metadata: { sender_name: data.senderName, proof: data.proof, currency: "USD" },
    });
    if (verifyError) throw new Error(verifyError.message);
    await db2Admin.rpc("enqueue_outbox", {
      p_event_type: "order.created",
      p_aggregate_type: "order",
      p_aggregate_id: order.id,
      p_idempotency_key: `order.created:${order.id}`,
      p_payload: { order_id: order.id, client_id: context.tenant.clientId },
    });
    return { ok: true, orderId: order.order_id, total };
  });
