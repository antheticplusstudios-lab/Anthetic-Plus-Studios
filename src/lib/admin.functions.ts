import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { db1Admin, db2Admin, db3Admin } from "@/server/db/clients.server";
import { assertAdmin, assertOwner, assertStaff, auditMutation } from "@/lib/platform-access.server";
import { encryptSecret } from "@/server/security/envelope.server";

export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        approve: z.boolean(),
        reason: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertStaff(context);
    const { data: payment, error } = await db2Admin
      .from("payment_verifications")
      .select("id,order_id,status")
      .eq("id", data.paymentId)
      .single();
    if (error || !payment) throw new Error("Payment verification not found");
    const { data: order, error: orderError } = await db2Admin
      .from("orders")
      .select("id,client_id")
      .eq("id", payment.order_id)
      .single();
    if (orderError || !order) throw new Error("Order for payment verification not found");
    const nextStatus = data.approve ? "approved" : "rejected";
    const updated = await db2Admin
      .from("payment_verifications")
      .update({
        status: nextStatus,
        notes: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.paymentId);
    if (updated.error) throw new Error(updated.error.message);
    if (data.approve) {
      const { error: orderError } = await db2Admin
        .from("orders")
        .update({
          status: "verified",
          verified_by: context.userId,
          verified_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (orderError) throw new Error(orderError.message);
    } else {
      const { error: orderError } = await db2Admin
        .from("orders")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejection_reason: data.reason,
        })
        .eq("id", order.id);
      if (orderError) throw new Error(orderError.message);
    }
    await auditMutation(
      context.userId,
      data.approve ? "payment.approved" : "payment.rejected",
      "payment_verification",
      data.paymentId,
      { reason: data.reason },
      String(order.client_id),
    );
    if (!data.approve) return { ok: true, crawled: false, snippet: "" };
    const { runProvisioningPipeline } = await import("./provisioning.server");
    const origin = new URL((await import("@tanstack/react-start/server")).getRequest().url).origin;
    return { ok: true, ...(await runProvisioningPipeline(data.paymentId, context.userId, origin)) };
  });

export const provisionAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ automationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: a, error } = await db2Admin
      .from("client_automations")
      .select("id,client_id,script_token_last4")
      .eq("id", data.automationId)
      .single();
    if (error || !a) throw new Error("Automation not found");
    const { data: token } = await db2Admin.rpc("generate_automation_token", {
      p_automation_id: data.automationId,
      p_generated_by: context.userId,
    });
    await auditMutation(
      context.userId,
      "automation.provisioned",
      "automation",
      data.automationId,
      {},
      String(a.client_id),
    );
    return { clientId: String(a.client_id), scriptToken: String(token ?? "") };
  });

export const runLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    assertAdmin(context);
    const now = new Date().toISOString();
    const { data: subs, error: subError } = await db2Admin
      .from("subscriptions")
      .select("id,client_id,status,current_period_end,grace_period_end");
    if (subError) throw new Error(subError.message);
    const subscriptionIds = (subs ?? []).map((subscription) => subscription.id);
    const { data: automations, error: automationError } = subscriptionIds.length
      ? await db2Admin
          .from("client_automations")
          .select("id,client_id,subscription_id,run_state,is_active")
          .in("subscription_id", subscriptionIds)
      : { data: [], error: null };
    if (automationError) throw new Error(automationError.message);
    const automationBySubscription = new Map(
      (automations ?? []).map((automation) => [automation.subscription_id, automation]),
    );
    for (const subscription of subs ?? []) {
      const expiresAt = subscription.current_period_end;
      const automation = automationBySubscription.get(subscription.id);
      if (!expiresAt || new Date(expiresAt).getTime() > Date.now()) continue;
      const inGrace = Boolean(
        subscription.grace_period_end &&
        new Date(subscription.grace_period_end).getTime() >= Date.now(),
      );
      const nextStatus = inGrace ? "suspended" : "expired";
      if (subscription.status === nextStatus) continue;
      const { error: statusError } = await db2Admin
        .from("subscriptions")
        .update({
          status: nextStatus,
          ...(nextStatus === "expired" ? { expired_at: now } : { suspended_at: now }),
        })
        .eq("id", subscription.id);
      if (statusError) throw new Error(statusError.message);
      if (automation) {
        await db2Admin
          .from("client_automations")
          .update({ run_state: nextStatus, is_active: false, status: nextStatus })
          .eq("id", automation.id);
        await db2Admin.rpc("enqueue_outbox", {
          p_event_type: `subscription.${nextStatus}`,
          p_aggregate_type: "subscription",
          p_aggregate_id: String(subscription.id),
          p_idempotency_key: `subscription:${subscription.id}:${nextStatus}:${expiresAt}`,
          p_payload: {
            client_id: subscription.client_id,
            automation_id: automation.id,
            automation_ids: [automation.id],
          },
        });
      }
    }
    await auditMutation(context.userId, "billing.lifecycle.run", "platform", null, { ranAt: now });
    return { ok: true };
  });

export const listGroqKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertOwner(context);
    const { data, error } = await db3Admin
      .from("llm_api_keys")
      .select(
        "id,provider_key,label,key_hint,model,priority,is_active,cooldown_until,request_count,error_count,last_used_at,last_error,created_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      ...row,
      enabled: !!row.is_active,
      is_primary: Number(row.priority ?? 100) === 0,
    }));
  });

export const createGroqKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        label: z.string().min(1).max(60),
        keyValue: z.string().min(8).max(500),
        isPrimary: z.boolean(),
        provider: z.enum(["groq", "openrouter", "openai", "anthropic"]).default("groq"),
        model: z.string().max(160).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertOwner(context);
    const keyHint = `${data.keyValue.slice(0, 6)}…${data.keyValue.slice(-4)}`;
    if (data.isPrimary)
      await db3Admin
        .from("llm_api_keys")
        .update({ priority: 1 })
        .eq("provider_key", data.provider)
        .eq("is_active", true);
    const { error } = await db3Admin.from("llm_api_keys").insert({
      provider_key: data.provider,
      label: data.label,
      key_hint: keyHint,
      key_ciphertext: encryptSecret(data.keyValue),
      model: data.model,
      priority: data.isPrimary ? 0 : 100,
      is_active: true,
    });
    if (error) throw new Error(error.message);
    await auditMutation(context.userId, "llm.key.created", "llm_api_key", null, {
      provider: data.provider,
      label: data.label,
    });
    return { ok: true };
  });

export const updateGroqKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        makePrimary: z.boolean().optional(),
        clearCooldown: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertOwner(context);
    const { data: current } = await db3Admin
      .from("llm_api_keys")
      .select("provider_key")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("AI key not found");
    if (data.makePrimary)
      await db3Admin
        .from("llm_api_keys")
        .update({ priority: 100 })
        .eq("provider_key", current.provider_key);
    const patch: { is_active?: boolean; priority?: number; cooldown_until?: string | null } = {};
    if (typeof data.enabled === "boolean") patch.is_active = data.enabled;
    if (data.makePrimary) patch.priority = 0;
    if (data.clearCooldown) patch.cooldown_until = null;
    if (Object.keys(patch).length) {
      const { error } = await db3Admin.from("llm_api_keys").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    await auditMutation(context.userId, "llm.key.updated", "llm_api_key", data.id, patch);
    return { ok: true };
  });

export const deleteGroqKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    assertOwner(context);
    const { error } = await db3Admin.from("llm_api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditMutation(context.userId, "llm.key.deleted", "llm_api_key", data.id);
    return { ok: true };
  });

export const validatePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ code: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { data: promo } = await db2Admin
      .from("promo_codes")
      .select("percent_off,active,expires_at")
      .eq("code", data.code.toUpperCase())
      .maybeSingle();
    if (
      !promo ||
      !promo.active ||
      (promo.expires_at && new Date(String(promo.expires_at)).getTime() <= Date.now())
    )
      return null;
    return Number(promo.percent_off ?? 0);
  });

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ email: z.string().email(), role: z.enum(["partner", "verifier", "admin"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (data.role === "partner") assertOwner(context);
    const { error } = await db1Admin.from("staff_invites").insert({
      email: data.email.toLowerCase(),
      requested_role: data.role,
      invited_by: context.userId,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["owner", "partner", "admin", "verifier", "client"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (data.role === "owner") throw new Error("The Owner role cannot be revoked here.");
    const { error } = await db1Admin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await auditMutation(context.userId, "staff.role.revoked", "user", data.userId, {
      role: data.role,
    });
    return { ok: true };
  });
