import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertOwner } from "@/lib/rbac.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";
import { jsonValueSchema } from "@/lib/json-schema";

const statusSchema = z.object({ status: z.string().optional() });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => statusSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    let query = db2Admin
      .from("orders")
      .select(ORDER_SELECT)
      .order("created_at", { ascending: false });
    if (data.status) query = query.eq("status", orderStatusToDb(data.status));
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const orders = rows ?? [];
    if (!orders.length) return [];

    const orderIds = orders.map((order) => order.id);
    const [{ data: payments, error: paymentError }] = await Promise.all([
      db2Admin
        .from("payment_verifications")
        .select(
          "id,order_id,payment_method_id,amount,status,notes,trx_id,sender_phone,metadata,created_at,reviewed_at",
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: false }),
    ]);
    if (paymentError) throw new Error(paymentError.message);
    const methodIds = [
      ...new Set(
        (payments ?? [])
          .map((payment) => payment.payment_method_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: methods, error: methodError } = methodIds.length
      ? await db2Admin
          .from("payment_methods")
          .select("id,method_type,provider_name,account_name,account_identifier")
          .in("id", methodIds)
      : { data: [], error: null };
    if (methodError) throw new Error(methodError.message);
    const paymentByOrder = new Map<string, (typeof payments)[number]>();
    for (const payment of payments ?? [])
      if (!paymentByOrder.has(payment.order_id)) paymentByOrder.set(payment.order_id, payment);
    const methodMap = new Map((methods ?? []).map((method) => [method.id, method]));

    return orders.map((order) => {
      const payment = paymentByOrder.get(order.id);
      const method = payment?.payment_method_id
        ? methodMap.get(payment.payment_method_id)
        : undefined;
      const metadata =
        order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
          ? (order.metadata as Record<string, unknown>)
          : {};
      const paymentMetadata =
        payment?.metadata &&
        typeof payment.metadata === "object" &&
        !Array.isArray(payment.metadata)
          ? (payment.metadata as Record<string, unknown>)
          : {};
      const pricing =
        metadata.pricing_snapshot &&
        typeof metadata.pricing_snapshot === "object" &&
        !Array.isArray(metadata.pricing_snapshot)
          ? (metadata.pricing_snapshot as Record<string, unknown>)
          : {};
      return {
        ...order,
        status: normalizeOrder(order).status,
        order_id: order.order_number,
        automation_type: order.product_type,
        full_name: String(metadata.full_name ?? ""),
        company_name: String(metadata.company_name ?? ""),
        contact_email: String(metadata.contact_email ?? ""),
        delivery_channel: String(metadata.delivery_channel ?? "web"),
        target_domain_url: String(metadata.target_domain_url ?? ""),
        origin_domain: String(metadata.origin_domain ?? ""),
        billing_plan: String(pricing.plan ?? "monthly"),
        automation_slug: String(order.product_type ?? ""),
        amount: payment?.amount ?? order.total_amount,
        payment_method: method?.account_name ?? method?.provider_name ?? method?.method_type ?? "",
        origin: String(metadata.origin_domain ?? ""),
        submitted_at: order.created_at,
        payment_methods: method
          ? { method_name: method.account_name ?? method.provider_name ?? method.method_type }
          : null,
        payment_proof_data: paymentMetadata.proof ?? {},
        transaction_id: payment?.trx_id ?? "",
        sender_name: String(paymentMetadata.sender_name ?? ""),
        payment_status: payment?.status ?? null,
        payment_id: payment?.id ?? null,
        payment_notes: payment?.notes ?? null,
      };
    });
  });

export const adminListAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data: autos, error } = await db2Admin
      .from("client_automations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = autos ?? [];
    const ids = list.map((automation) => automation.id);
    const clientIds = [...new Set(list.map((automation) => automation.client_id))];
    const period = new Date().toISOString().slice(0, 7);

    const [
      profiles,
      owners,
      organizations,
      health,
      usage,
      conversations,
      leads,
      aiConfigs,
      integrations,
      installs,
      scripts,
      llmRequests,
    ] = await Promise.all([
      clientIds.length
        ? db1Admin
            .from("profiles")
            .select(
              "id,user_id,client_id,default_organization_id,full_name,company_name,company_email,website_url,registered_origin_domain",
            )
            .in("client_id", clientIds)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length
        ? db1Admin
            .from("organization_members")
            .select("organization_id,user_id,role,is_active")
            .in("organization_id", clientIds)
            .eq("role", "owner")
            .eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length
        ? db1Admin
            .from("organizations")
            .select("id,name,signup_origin,origin_domain")
            .in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db2Admin
            .from("automation_health")
            .select("automation_id,overall,summary,checked_at,last_success_at,last_failure_at")
            .in("automation_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db2Admin
            .from("usage_meters")
            .select("automation_id,tokens_used,call_minutes_used,sms_count_used,billing_period")
            .eq("billing_period", period)
            .in("automation_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db4Admin
            .from("conversations")
            .select("automation_id,channel,last_message_at")
            .in("automation_id", ids)
            .order("last_message_at", { ascending: false })
            .limit(3000)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db4Admin.from("leads").select("automation_id").in("automation_id", ids).limit(3000)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db3Admin
            .from("ai_configs")
            .select("automation_id,status,system_prompt,behavior_config")
            .in("automation_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db2Admin
            .from("integration_connections")
            .select("automation_id,provider,status")
            .in("automation_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db2Admin
            .from("automation_installations")
            .select("automation_id,installation_status,installed_at,last_seen_at,domain")
            .in("automation_id", ids)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db2Admin
            .from("script_generations")
            .select("automation_id,id,invalidated_at,token_hint,created_at")
            .in("automation_id", ids)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? db3Admin
            .from("llm_requests")
            .select("automation_id,status")
            .in("automation_id", ids)
            .eq("status", "error")
            .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [
      profiles,
      owners,
      organizations,
      health,
      usage,
      conversations,
      leads,
      aiConfigs,
      integrations,
      installs,
      scripts,
      llmRequests,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const subscriptionIds = [
      ...new Set(
        list
          .map((automation) => automation.subscription_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: subscriptions, error: subscriptionError } = subscriptionIds.length
      ? await db2Admin
          .from("subscriptions")
          .select("id,status,plan_code,current_period_end,grace_period_end,renewal_at")
          .in("id", subscriptionIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (subscriptionError) throw new Error(subscriptionError.message);

    const pMap = new Map((profiles.data ?? []).map((profile) => [profile.client_id, profile]));
    const ownerMap = new Map(
      (owners.data ?? []).map((owner) => [owner.organization_id, owner.user_id]),
    );
    const orgMap = new Map(
      (organizations.data ?? []).map((organization) => [organization.id, organization]),
    );
    const hMap = new Map((health.data ?? []).map((item) => [item.automation_id, item]));
    const uMap = new Map((usage.data ?? []).map((item) => [item.automation_id, item]));
    const sMap = new Map(
      (subscriptions ?? []).map((subscription) => [subscription.id, subscription]),
    );
    const aiMap = new Map((aiConfigs.data ?? []).map((config) => [config.automation_id, config]));
    const installMap = new Map<
      string,
      {
        automation_id: string;
        installation_status: string;
        installed_at: string | null;
        last_seen_at: string | null;
        domain: string | null;
      }
    >();
    for (const installation of installs.data ?? [])
      if (!installMap.has(installation.automation_id))
        installMap.set(installation.automation_id, installation);
    const scriptMap = new Map<
      string,
      {
        automation_id: string;
        id: string;
        invalidated_at: string | null;
        token_hint: string;
        created_at: string;
      }
    >();
    for (const script of scripts.data ?? [])
      if (!scriptMap.has(script.automation_id)) scriptMap.set(script.automation_id, script);
    const channels = new Map<string, Set<string>>();
    const lastActivity = new Map<string, string>();
    const conversationCounts = new Map<string, number>();
    for (const conversation of conversations.data ?? []) {
      channels.set(
        conversation.automation_id,
        (channels.get(conversation.automation_id) ?? new Set()).add(conversation.channel),
      );
      conversationCounts.set(
        conversation.automation_id,
        (conversationCounts.get(conversation.automation_id) ?? 0) + 1,
      );
      if (!lastActivity.has(conversation.automation_id))
        lastActivity.set(conversation.automation_id, conversation.last_message_at);
    }
    const leadCounts = new Map<string, number>();
    for (const lead of leads.data ?? [])
      leadCounts.set(lead.automation_id, (leadCounts.get(lead.automation_id) ?? 0) + 1);
    const intFail = new Set(
      (integrations.data ?? [])
        .filter((integration) => integration.status !== "connected")
        .map((integration) => integration.automation_id),
    );
    const providerFailures = new Map<string, number>();
    for (const request of llmRequests.data ?? [])
      providerFailures.set(
        request.automation_id ?? "",
        (providerFailures.get(request.automation_id ?? "") ?? 0) + 1,
      );

    return list.map((automation) => {
      const profile = pMap.get(automation.client_id);
      const subscription = automation.subscription_id
        ? sMap.get(automation.subscription_id)
        : undefined;
      const ai = aiMap.get(automation.id);
      const healthRow = hMap.get(automation.id);
      const usageRow = uMap.get(automation.id);
      const installation = installMap.get(automation.id);
      const script = scriptMap.get(automation.id);
      const daysRemaining = automation.expires_at
        ? Math.ceil((new Date(automation.expires_at).getTime() - Date.now()) / 86400000)
        : null;
      const runState = String(automation.run_state || automation.status);
      const killed =
        ["stopped", "disabled", "suspended", "expired", "decommissioned"].includes(runState) ||
        !automation.is_active;
      const status = killed
        ? runState === "expired"
          ? "expired"
          : "paused"
        : subscription?.status === "trial"
          ? "trialing"
          : "active";
      const metadata =
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
      const organization = orgMap.get(automation.client_id);
      return {
        ...automation,
        clientId: automation.client_id,
        ownerUserId: ownerMap.get(automation.client_id) ?? profile?.user_id ?? profile?.id ?? null,
        clientName: profile?.full_name ?? automation.client_name ?? "",
        company: profile?.company_name ?? automation.company_name ?? automation.name,
        type: automation.automation_type ?? automation.product_type,
        automation_type: automation.automation_type ?? automation.product_type,
        orderId: typeof metadata.order_id === "string" ? metadata.order_id : null,
        order_id: typeof metadata.order_id === "string" ? metadata.order_id : null,
        domain: automation.domain_url ?? automation.domain ?? "",
        domain_url: automation.domain_url ?? automation.domain ?? "",
        runState,
        runtime: runState,
        isActive: automation.is_active,
        health: healthRow?.overall ?? automation.health_status ?? automation.health ?? "unknown",
        healthSummary: healthRow?.summary ?? "",
        healthCheckedAt: healthRow?.checked_at ?? automation.last_health_check_at ?? null,
        createdAt: automation.created_at,
        expiresAt: automation.expires_at ?? subscription?.current_period_end ?? null,
        renewalAt: automation.renewal_at ?? subscription?.renewal_at ?? null,
        daysRemaining,
        tokens: Number(usageRow?.tokens_used ?? 0),
        channels: [...(channels.get(automation.id) ?? new Set<string>())],
        phone:
          typeof metadata.assigned_phone_number === "string"
            ? metadata.assigned_phone_number
            : null,
        lastActivity: lastActivity.get(automation.id) ?? automation.last_heartbeat_at ?? null,
        installed:
          installation?.installation_status === "active" || Boolean(installation?.installed_at),
        requiresReinstallation: automation.requires_reinstallation,
        origin:
          automation.domain ??
          profile?.registered_origin_domain ??
          organization?.origin_domain ??
          "",
        originDomain:
          automation.domain ??
          profile?.registered_origin_domain ??
          organization?.origin_domain ??
          "",
        signupOrigin: organization?.signup_origin ?? "other",
        signupOriginLabel:
          organization?.signup_origin === "partner"
            ? "Partner"
            : organization?.signup_origin === "antheticplus"
              ? "AntheticPlus"
              : "Other",
        organizationName: organization?.name ?? profile?.company_name ?? "",
        integrationFailure: intFail.has(automation.id),
        providerFailures: providerFailures.get(automation.id) ?? 0,
        automation_slug: automation.automation_type ?? automation.product_type,
        website_domain: automation.domain_url ?? automation.domain ?? "",
        status,
        killed,
        billing_plan: subscription?.plan_code ?? automation.product_type,
        grace_days: subscription?.grace_period_end
          ? Math.max(
              0,
              Math.ceil(
                (new Date(subscription.grace_period_end).getTime() - Date.now()) / 86400000,
              ),
            )
          : 0,
        warning_sent: false,
        conversations_count: conversationCounts.get(automation.id) ?? 0,
        leads_count: leadCounts.get(automation.id) ?? 0,
        business_context: String(behavior.business_context ?? ""),
        system_prompt: String(ai?.system_prompt ?? ""),
        prompt_override: String(ai?.system_prompt ?? ""),
        subscription_status: subscription?.status ?? null,
        subscription_expires_at: subscription?.current_period_end ?? automation.expires_at ?? null,
        installation_status:
          installation?.installation_status ?? automation.installation_status ?? "none",
        installation_last_seen_at: installation?.last_seen_at ?? null,
        token_hint: automation.script_token_last4 ?? script?.token_hint ?? "",
        assigned_phone_number:
          typeof metadata.assigned_phone_number === "string"
            ? metadata.assigned_phone_number
            : null,
        webhook_url: typeof metadata.webhook_url === "string" ? metadata.webhook_url : null,
      };
    });
  });

export const adminUpdateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        patch: z
          .object({
            is_active: z.boolean().optional(),
            run_state: z.string().optional(),
            requires_reinstallation: z.boolean().optional(),
            domain_url: z.string().nullable().optional(),
            allowed_domains: z.array(z.string()).optional(),
            name: z.string().optional(),
            widget_config: z.record(z.string(), jsonValueSchema).optional(),
            assigned_phone_number: z.string().nullable().optional(),
            webhook_url: z.string().nullable().optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: existing } = await db2Admin
      .from("client_automations")
      .select("id,client_id")
      .eq("id", data.automationId)
      .maybeSingle();
    if (!existing) throw new Error("Automation not found");
    if (!context.tenant.isSuperAdmin && existing.client_id !== context.tenant.clientId)
      throw new Response("Forbidden", { status: 403 });
    const directPatch = {
      ...(data.patch.is_active !== undefined ? { is_active: data.patch.is_active } : {}),
      ...(data.patch.run_state !== undefined ? { run_state: data.patch.run_state } : {}),
      ...(data.patch.requires_reinstallation !== undefined
        ? { requires_reinstallation: data.patch.requires_reinstallation }
        : {}),
      ...(data.patch.domain_url !== undefined ? { domain_url: data.patch.domain_url } : {}),
      ...(data.patch.allowed_domains !== undefined
        ? { allowed_domains: data.patch.allowed_domains }
        : {}),
      ...(data.patch.name !== undefined ? { name: data.patch.name } : {}),
      ...(data.patch.widget_config !== undefined
        ? { widget_config: data.patch.widget_config }
        : {}),
    };
    const metadataPatch = {
      ...(data.patch.assigned_phone_number !== undefined
        ? { assigned_phone_number: data.patch.assigned_phone_number }
        : {}),
      ...(data.patch.webhook_url !== undefined ? { webhook_url: data.patch.webhook_url } : {}),
    };
    const { data: before } = await db2Admin
      .from("client_automations")
      .select("*")
      .eq("id", data.automationId)
      .maybeSingle();
    if (!before) throw new Error("Automation not found");
    const existingMetadata =
      before.metadata && typeof before.metadata === "object" && !Array.isArray(before.metadata)
        ? (before.metadata as Record<string, unknown>)
        : {};
    const updatePayload = Object.keys(metadataPatch).length
      ? { ...directPatch, metadata: { ...existingMetadata, ...metadataPatch } }
      : directPatch;
    const { error } = await db2Admin
      .from("client_automations")
      .update(updatePayload)
      .eq("id", data.automationId);
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "automation.updated",
      targetId: data.automationId,
      targetType: "automation",
      before,
      after: updatePayload,
      clientId: existing.client_id,
    });
    return { ok: true };
  });

export const adminExtendAutomationLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        days: z.number().int().min(1).max(3650),
        graceDays: z.number().int().min(0).max(365).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: a } = await db2Admin
      .from("client_automations")
      .select("id,client_id,subscription_id,expires_at,renewal_at")
      .eq("id", data.automationId)
      .maybeSingle();
    if (!a || (!context.tenant.isSuperAdmin && a.client_id !== context.tenant.clientId))
      throw new Response("Forbidden", { status: 403 });
    const base =
      a.expires_at && new Date(a.expires_at) > new Date() ? new Date(a.expires_at) : new Date();
    const next = new Date(base.getTime() + data.days * 86400000).toISOString();
    const grace =
      data.graceDays === undefined
        ? undefined
        : new Date(new Date(next).getTime() + data.graceDays * 86400000).toISOString();
    if (a.subscription_id)
      await db2Admin
        .from("subscriptions")
        .update({
          current_period_end: next,
          renewal_at: next,
          ...(grace ? { grace_period_end: grace } : {}),
          status: "active",
        })
        .eq("id", a.subscription_id);
    await db2Admin
      .from("client_automations")
      .update({ expires_at: next, renewal_at: next, run_state: "active", is_active: true })
      .eq("id", a.id);
    await auditMutation(context, {
      action: "automation.lifecycle.extended",
      targetId: a.id,
      targetType: "automation",
      after: { days: data.days, expires_at: next, grace_period_end: grace ?? null },
      clientId: a.client_id,
    });
    return { ok: true, expiresAt: next, gracePeriodEnd: grace ?? null };
  });

export const adminSetAutomationKill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        killed: z.boolean(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: a } = await db2Admin
      .from("client_automations")
      .select("id,client_id,run_state,is_active")
      .eq("id", data.automationId)
      .maybeSingle();
    if (!a || (!context.tenant.isSuperAdmin && a.client_id !== context.tenant.clientId))
      throw new Response("Forbidden", { status: 403 });
    const next = data.killed ? "paused" : "active";
    const result = await db2Admin.rpc("set_automation_runtime_state", {
      p_automation_id: a.id,
      p_state: next,
      p_reason: data.reason ?? "admin control",
      p_idempotency_key: `admin-runtime:${a.id}:${next}:${Date.now()}`,
      p_actor_user_id: context.userId,
    });
    if (result.error) throw new Error(result.error.message);
    if (!data.killed)
      await db2Admin.from("client_automations").update({ is_active: true }).eq("id", a.id);
    await auditMutation(context, {
      action: data.killed ? "automation.kill.engaged" : "automation.kill.released",
      targetId: a.id,
      targetType: "automation",
      after: { run_state: next, reason: data.reason ?? null },
      clientId: a.client_id,
    });
    return { ok: true, runState: next };
  });

export const adminSetAutomationPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ automationId: z.string().uuid(), prompt: z.string().max(20000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: a } = await db2Admin
      .from("client_automations")
      .select("id,client_id")
      .eq("id", data.automationId)
      .maybeSingle();
    if (!a || (!context.tenant.isSuperAdmin && a.client_id !== context.tenant.clientId))
      throw new Response("Forbidden", { status: 403 });
    const { data: current } = await db3Admin
      .from("prompt_versions")
      .select("version")
      .eq("prompt_key", `automation:${a.id}`)
      .eq("automation_id", a.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = Number(current?.version ?? 0) + 1;
    await db3Admin
      .from("prompt_versions")
      .update({ is_active: false })
      .eq("prompt_key", `automation:${a.id}`)
      .eq("automation_id", a.id);
    const { error } = await db3Admin.from("prompt_versions").insert({
      prompt_key: `automation:${a.id}`,
      automation_id: a.id,
      version,
      content: data.prompt,
      is_active: true,
      created_by_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const { error: cfgError } = await db3Admin.from("ai_configs").upsert(
      {
        automation_id: a.id,
        client_id: a.client_id,
        system_prompt: data.prompt,
        status: "active",
        behavior_config: {},
      },
      { onConflict: "automation_id" },
    );
    if (cfgError) throw new Error(cfgError.message);
    await auditMutation(context, {
      action: "automation.prompt.updated",
      targetId: a.id,
      targetType: "automation",
      after: { prompt_length: data.prompt.length },
      clientId: a.client_id,
    });
    return { ok: true, version };
  });

export const adminListPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db2Admin
      .from("pricing_plans")
      .select("*")
      .order("monthly_price", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const adminSavePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        slug: z.string().min(2).max(80),
        name: z.string().min(2).max(100),
        monthly_price: z.number().min(0),
        yearly_price: z.number().min(0).nullable().optional(),
        yearly_discount_pct: z.number().min(0).max(100).optional(),
        active: z.boolean(),
        listed: z.boolean().optional(),
        description: z.string().max(600).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const yearly_price =
      data.yearly_price ??
      Number((data.monthly_price * 12 * (1 - (data.yearly_discount_pct ?? 20) / 100)).toFixed(2));
    const row = {
      slug: data.slug,
      product_type: data.slug,
      name: data.name,
      monthly_price: data.monthly_price,
      yearly_price,
      active: data.active,
      listed: data.listed ?? true,
      description: data.description ?? "",
    };
    const { error } = await db2Admin.from("pricing_plans").upsert(row, { onConflict: "slug" });
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "pricing.updated",
      targetId: null,
      targetType: "pricing_plan",
      after: row,
    });
    return { ok: true };
  });
export const adminListPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db2Admin
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const adminUpdatePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { error } = await db2Admin
      .from("promo_codes")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "promo.updated",
      targetId: data.id,
      targetType: "promo_code",
      after: { active: data.active },
    });
    return { ok: true };
  });
export const adminDeletePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { error } = await db2Admin.from("promo_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "promo.deleted",
      targetId: data.id,
      targetType: "promo_code",
    });
    return { ok: true };
  });
export const adminCreatePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(2).max(80),
        percent_off: z.number().int().min(1).max(90),
        expires_at: z.string().datetime().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: row, error } = await db2Admin
      .from("promo_codes")
      .insert({
        code: data.code.toUpperCase(),
        percent_off: data.percent_off,
        expires_at: data.expires_at,
        active: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const adminListPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db2Admin.from("payment_methods").select("*").order("created_at");
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
export const adminSavePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        method_name: z.string().min(2).max(120),
        instructions: z.string().max(3000),
        required_fields: z.array(z.string().max(100)).max(20),
        is_active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const row = {
      method_type: data.method_name.toLowerCase().includes("card")
        ? "card"
        : data.method_name.toLowerCase().includes("wallet")
          ? "mobile_money"
          : "bank_transfer",
      provider_name: "Manual",
      account_name: data.method_name,
      account_identifier: "Configure in Control Center",
      is_active: data.is_active,
      metadata: { instructions: data.instructions, required_fields: data.required_fields },
    };
    const { error } = data.id
      ? await db2Admin.from("payment_methods").update(row).eq("id", data.id)
      : await db2Admin
          .from("payment_methods")
          .insert({ ...row, client_id: context.tenant.clientId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRunLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const now = Date.now();
    const { data: subs, error } = await db2Admin
      .from("subscriptions")
      .select("id,client_id,status,current_period_end,grace_period_end");
    if (error) throw new Error(error.message);
    const ids = (subs ?? []).map((subscription) => subscription.id);
    const { data: automations, error: automationError } = ids.length
      ? await db2Admin
          .from("client_automations")
          .select("id,subscription_id")
          .in("subscription_id", ids)
      : { data: [], error: null };
    if (automationError) throw new Error(automationError.message);
    const automationBySubscription = new Map(
      (automations ?? []).map((automation) => [automation.subscription_id, automation]),
    );
    let expired = 0,
      suspended = 0;
    for (const subscription of subs ?? []) {
      if (
        !subscription.current_period_end ||
        new Date(subscription.current_period_end).getTime() > now
      )
        continue;
      const inGrace =
        !!subscription.grace_period_end && new Date(subscription.grace_period_end).getTime() >= now;
      const next = inGrace ? "suspended" : "expired";
      if (subscription.status === next) continue;
      const { error: statusError } = await db2Admin
        .from("subscriptions")
        .update({
          status: next,
          ...(next === "expired"
            ? { expired_at: new Date().toISOString() }
            : { suspended_at: new Date().toISOString() }),
        })
        .eq("id", subscription.id);
      if (statusError) throw new Error(statusError.message);
      if (next === "expired") expired++;
      else suspended++;
      const automation = automationBySubscription.get(subscription.id);
      if (automation) {
        await db2Admin
          .from("client_automations")
          .update({ run_state: next, is_active: false, status: next })
          .eq("id", automation.id);
        await db2Admin.rpc("enqueue_outbox", {
          p_event_type: `subscription.${next}`,
          p_aggregate_type: "subscription",
          p_aggregate_id: subscription.id,
          p_idempotency_key: `subscription:${subscription.id}:${next}:${String(subscription.current_period_end)}`,
          p_payload: {
            client_id: subscription.client_id,
            automation_id: automation.id,
            automation_ids: [automation.id],
          },
        });
      }
    }
    await auditMutation(context, {
      action: "billing.lifecycle.run",
      targetId: null,
      targetType: "platform",
      after: { expired, suspended },
    });
    return { ok: true, expired, suspended };
  });

export const adminListPrompts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db3Admin
      .from("prompt_versions")
      .select("prompt_key,version,content,is_active,created_at,automation_id")
      .order("prompt_key")
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    const latest = new Map<string, NonNullable<typeof data>[number]>();
    for (const row of data ?? [])
      if (!row.automation_id && !latest.has(row.prompt_key)) latest.set(row.prompt_key, row);
    return [...latest.values()].map((r) => ({ ...r, key: r.prompt_key }));
  });

export const adminSavePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ key: z.string().min(1).max(120), content: z.string().max(20000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertOwner(context);
    const { data: current } = await db3Admin
      .from("prompt_versions")
      .select("version")
      .eq("prompt_key", data.key)
      .is("automation_id", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = Number(current?.version ?? 0) + 1;
    await db3Admin
      .from("prompt_versions")
      .update({ is_active: false })
      .eq("prompt_key", data.key)
      .is("automation_id", null);
    const { error } = await db3Admin.from("prompt_versions").insert({
      prompt_key: data.key,
      version,
      content: data.content,
      is_active: true,
      created_by_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "prompt.baseline.updated",
      targetId: null,
      targetType: "prompt",
      after: { key: data.key, version },
    });
    return { ok: true, version };
  });

export const adminListStaffInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db1Admin
      .from("staff_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((invite) => ({ ...invite, role: invite.requested_role }));
  });
export const adminRevokeStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { error } = await db1Admin
      .from("staff_invites")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const [{ data: platform, error: pErr }, { data: flags, error: fErr }] = await Promise.all([
      db1Admin.from("platform_settings").select("key,value"),
      db1Admin.from("feature_flags").select("key,is_enabled,rules"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (fErr) throw new Error(fErr.message);
    const out: Record<
      string,
      Record<string, import("@/integrations/supabase/types").Json | undefined>
    > = {};
    for (const r of platform ?? []) {
      const value = r.value;
      out[r.key] = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    out.feature_flags = Object.fromEntries(
      (flags ?? []).map((f) => [f.key, f.is_enabled] as const),
    );
    return out;
  });

export const adminSaveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        key: z.enum(["banner", "maintenance", "feature_flags"]),
        value: z.record(z.string(), jsonValueSchema),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (data.key === "feature_flags") {
      for (const [key, enabled] of Object.entries(data.value)) {
        await db1Admin
          .from("feature_flags")
          .upsert({ key, is_enabled: Boolean(enabled) }, { onConflict: "key" });
      }
    } else {
      const { error } = await db1Admin
        .from("platform_settings")
        .upsert(
          { key: data.key, value: data.value, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw new Error(error.message);
    }
    await auditMutation(context, {
      action: "settings.updated",
      targetId: null,
      targetType: data.key,
      after: data.value,
    });
    return { ok: true };
  });

export const adminSetFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ key: z.string().min(1).max(100), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { error } = await db1Admin
      .from("feature_flags")
      .upsert({ key: data.key, is_enabled: data.enabled }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "feature_flag.updated",
      targetId: null,
      targetType: "feature_flag",
      after: { key: data.key, enabled: data.enabled },
    });
    return { ok: true };
  });

export const adminListCrm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const [{ data: profiles }, { data: autos }, { data: payments }, { data: tags }] =
      await Promise.all([
        db1Admin
          .from("profiles")
          .select("id,user_id,client_id,company_name,company_email,website_url,category,full_name"),
        db2Admin.from("client_automations").select("client_id,run_state,is_active,expires_at"),
        db2Admin.from("orders").select("client_id,total_amount,status"),
        db4Admin.from("client_tags").select("id,client_id,tag"),
      ]);
    return (profiles ?? []).map((p) => {
      const a = (autos ?? []).filter((x) => x.client_id === p.client_id);
      const pay = (payments ?? []).filter(
        (x) => x.client_id === p.client_id && x.status === "verified",
      );
      return {
        profile: p,
        revenue: pay.reduce((sum, x) => sum + Number(x.total_amount ?? 0), 0),
        automationsCount: a.length,
        liveCount: a.filter(
          (x) =>
            x.run_state === "active" &&
            x.is_active &&
            (!x.expires_at || new Date(x.expires_at) > new Date()),
        ).length,
        tags: (tags ?? []).filter((t) => t.client_id === p.client_id),
      };
    });
  });
export const adminAddCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), tag: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { error } = await db4Admin
      .from("client_tags")
      .insert({ client_id: data.clientId, tag: data.tag });
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "crm.tag.added",
      targetId: data.clientId,
      targetType: "client",
      after: { tag: data.tag },
      clientId: data.clientId,
    });
    return { ok: true };
  });
export const adminRemoveCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: row } = await db4Admin
      .from("client_tags")
      .select("id,client_id,tag")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db4Admin.from("client_tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditMutation(context, {
      action: "crm.tag.removed",
      targetId: data.id,
      targetType: "client_tag",
      after: row ?? {},
      clientId: row?.client_id ?? null,
    });
    return { ok: true };
  });

export const adminReviewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        approve: z.boolean(),
        reason: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: pv, error: pvError } = await db2Admin
      .from("payment_verifications")
      .select("id,order_id,status")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pvError) throw new Error(pvError.message);
    if (!pv) throw new Error("Payment verification not found.");
    const now = new Date().toISOString();
    const next = data.approve ? "approved" : "rejected";
    const { error } = await db2Admin
      .from("payment_verifications")
      .update({ status: next, notes: data.reason, reviewed_by: context.userId, reviewed_at: now })
      .eq("id", pv.id);
    if (error) throw new Error(error.message);
    const { data: order, error: orderError } = await db2Admin
      .from("orders")
      .select("client_id")
      .eq("id", data.orderId)
      .single();
    if (orderError || !order) throw new Error(orderError?.message ?? "Order not found");
    const { error: orderUpdateError } = await db2Admin
      .from("orders")
      .update({
        status: data.approve ? "verified" : "rejected",
        verified_by: data.approve ? context.userId : null,
        verified_at: data.approve ? now : null,
        rejected_at: data.approve ? null : now,
        rejection_reason: data.approve ? null : data.reason,
      })
      .eq("id", data.orderId);
    if (orderUpdateError) throw new Error(orderUpdateError.message);
    await auditMutation(context, {
      action: data.approve ? "order.approved" : "order.rejected",
      targetId: data.orderId,
      targetType: "order",
      after: { reason: data.reason },
      clientId: order.client_id,
    });
    if (!data.approve) return { ok: true, crawled: false, snippet: "" };
    const { runProvisioningPipeline } = await import("./provisioning.server");
    const origin = new URL((await import("@tanstack/react-start/server")).getRequest().url).origin;
    return { ok: true, ...(await runProvisioningPipeline(pv.id, context.userId, origin)) };
  });

export const adminListProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db1Admin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const adminListTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db4Admin
      .from("client_tags")
      .select("id,client_id,tag,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const adminListRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db1Admin.from("user_roles").select("user_id,role,created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db1Admin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      ...row,
      actor_email: null,
      target: row.target_type ?? "",
      details: row.metadata,
    }));
  });
export const adminListUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db3Admin
      .from("llm_requests")
      .select(
        "id,automation_id,client_id,provider_key,model,status,http_status,tokens_in,tokens_out,latency_ms,error,created_at,key_id",
      )
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...r,
      tokens_used: Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0),
    }));
  });
export const adminListTranscripts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const [{ data: convs, error: cErr }, { data: messages, error: mErr }] = await Promise.all([
      db4Admin
        .from("conversations")
        .select(
          "id,automation_id,client_id,channel,status,created_at,last_message_at,summary,extracted_lead_data,visitor_session,customer_phone_or_id,origin",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      db4Admin
        .from("messages")
        .select("conversation_id,role,content,created_at")
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (mErr) throw new Error(mErr.message);
    return (convs ?? []).map((c) => ({
      ...c,
      visitor: c.customer_phone_or_id ?? c.visitor_session ?? c.origin ?? "Anonymous visitor",
      messages: (messages ?? []).filter((m) => m.conversation_id === c.id),
    }));
  });
export const adminListFailoverLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const { data, error } = await db3Admin
      .from("llm_requests")
      .select("id,provider_key,http_status,status,error,created_at,latency_ms,key_id")
      .in("status", ["error", "timeout", "rate_limited"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...r,
      status_code: r.http_status,
      message: r.error ?? r.status,
    }));
  });
