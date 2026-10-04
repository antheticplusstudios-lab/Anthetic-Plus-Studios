import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertOwner } from "@/lib/rbac.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";

const statusSchema = z.object({ status: z.string().optional() });

export const adminListOrders = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).validator((d: unknown) => statusSchema.parse(d ?? {})).handler(async ({ data, context }) => {
  assertAdmin(context);
  let q = db2Admin.from("orders").select(ORDER_SELECT as "*").order("created_at", { ascending: false });
  if (data.status) q = q.eq("status", data.status);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  return rows ?? [];
});

export const adminListAutomations = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const { data: autos, error } = await db2Admin.from("client_automations").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const list = (autos ?? []) as any[];
  const ids = list.map((a) => a.id);
  const cids = [...new Set(list.map((a) => a.client_id))];
  const period = new Date().toISOString().slice(0, 7);
  const [profiles, restrictions, organizations, health, usage, conversations, leads, subs, aiConfigs, integrations, installs, scripts, llmRequests] = await Promise.all([
    cids.length ? db1Admin.from("profiles").select("id,user_id,client_id,default_organization_id,full_name,company_name,company_email,website_url,registered_origin_domain").in("client_id", cids) : Promise.resolve({ data: [] as any[] }),
    cids.length ? db1Admin.from("organization_members").select("organization_id,user_id,role,is_active").in("organization_id", cids).eq("role", "owner").eq("is_active", true) : Promise.resolve({ data: [] as any[] }),
    cids.length ? db1Admin.from("organizations").select("id,name,signup_origin,origin_domain").in("id", cids) : Promise.resolve({ data: [] as any[] }),
    cids.length ? db1Admin.from("organizations").select("id,name,signup_origin,origin_domain").in("id", cids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db2Admin.from("automation_health").select("*").in("automation_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db2Admin.from("usage_meters").select("automation_id,tokens_used,call_minutes_used,sms_count_used,billing_period").eq("billing_period", period).in("automation_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db4Admin.from("conversations").select("automation_id,channel,last_message_at").in("automation_id", ids).order("last_message_at", { ascending: false }).limit(3000) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db4Admin.from("leads").select("automation_id").in("automation_id", ids).limit(3000) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db2Admin.from("subscriptions").select("id,automation_id,plan_slug,status,renewal_at,expires_at,grace_period_end").in("automation_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db3Admin.from("ai_configs").select("automation_id,status,system_prompt,behavior_config").in("automation_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db2Admin.from("integration_connections").select("automation_id,provider,status").in("automation_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db2Admin.from("automation_installations").select("automation_id,status,last_seen_at,installed_at,domain").in("automation_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db2Admin.from("script_generations").select("automation_id,id,invalidated_at,token_hint,created_at").in("automation_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db3Admin.from("llm_requests").select("automation_id,status").in("automation_id", ids).eq("status", "error").gte("created_at", new Date(Date.now() - 86400000).toISOString()) : Promise.resolve({ data: [] as any[] }),
  ]);
  const pMap = new Map((profiles.data ?? []).map((p: any) => [p.client_id, p]));
  const ownerMap = new Map((restrictions.data ?? []).map((r: any) => [r.organization_id, r.user_id]));
  const orgMap = new Map((organizations.data ?? []).map((o: any) => [o.id, o]));
  const hMap = new Map((health.data ?? []).map((h: any) => [h.automation_id, h]));
  const uMap = new Map((usage.data ?? []).map((u: any) => [u.automation_id, u]));
  const sMap = new Map<string, any>();
  for (const s of subs.data ?? []) if (!sMap.has(s.automation_id)) sMap.set(s.automation_id, s);
  const aiMap = new Map((aiConfigs.data ?? []).map((x: any) => [x.automation_id, x]));
  const installMap = new Map<string, any>();
  for (const x of installs.data ?? []) if (!installMap.has(x.automation_id)) installMap.set(x.automation_id, x);
  const scriptMap = new Map<string, any>();
  for (const x of scripts.data ?? []) if (!scriptMap.has(x.automation_id)) scriptMap.set(x.automation_id, x);
  const channels = new Map<string, Set<string>>();
  const lastActivity = new Map<string, string>();
  for (const c of conversations.data ?? []) {
    channels.set(c.automation_id, (channels.get(c.automation_id) ?? new Set()).add(c.channel));
    if (!lastActivity.has(c.automation_id) && c.last_message_at) lastActivity.set(c.automation_id, c.last_message_at);
  }
  const leadCounts = new Map<string, number>();
  for (const l of leads.data ?? []) leadCounts.set(l.automation_id, (leadCounts.get(l.automation_id) ?? 0) + 1);
  const intFail = new Set((integrations.data ?? []).filter((i: any) => i.status !== "connected").map((i: any) => i.automation_id));
  const providerFailures = new Map<string, number>();
  for (const r of llmRequests.data ?? []) providerFailures.set(r.automation_id, (providerFailures.get(r.automation_id) ?? 0) + 1);

  const mapped = list.map((a) => {
    const p = pMap.get(a.client_id) ?? {};
    const s = sMap.get(a.id) ?? {};
    const ai = aiMap.get(a.id) ?? {};
    const h = hMap.get(a.id) ?? {};
    const u = uMap.get(a.id) ?? {};
    const ins = installMap.get(a.id);
    const script = scriptMap.get(a.id);
    const exp = a.expires_at ? Math.ceil((new Date(a.expires_at).getTime() - Date.now()) / 86400000) : null;
    const killed = ["stopped", "disabled", "suspended", "expired"].includes(String(a.run_state)) || !a.is_active;
    const status = killed ? (a.run_state === "expired" ? "expired" : "paused") : (s.status === "trialing" ? "trialing" : "active");
    const prompt = String(ai.system_prompt ?? "");
    return {
      ...a,
      clientId: a.client_id,
      ownerUserId: ownerMap.get(a.client_id) ?? p.user_id ?? p.id ?? null,
      clientName: p.full_name ?? "",
      company: p.company_name ?? a.name ?? "",
      type: a.automation_type,
      orderId: a.order_id,
      domain: a.domain_url,
      runState: a.run_state,
      runtime: a.run_state,
      isActive: !!a.is_active,
      health: h.overall ?? "unknown",
      healthSummary: h.summary ?? "",
      healthCheckedAt: h.checked_at ?? null,
      createdAt: a.created_at,
      expiresAt: s.expires_at ?? a.expires_at,
      renewalAt: s.renewal_at ?? a.renewal_at,
      daysRemaining: exp,
      tokens: Number(u.tokens_used ?? 0),
      channels: [...(channels.get(a.id) ?? new Set())],
      phone: a.assigned_phone_number ?? null,
      lastActivity: lastActivity.get(a.id) ?? a.last_seen_at ?? null,
      installed: ins?.status === "active" || !!ins?.installed_at,
      requiresReinstallation: !!a.requires_reinstallation,
      origin: a.origin_domain ?? p.registered_origin_domain ?? orgMap.get(a.client_id)?.origin_domain ?? "",
      originDomain: a.origin_domain ?? orgMap.get(a.client_id)?.origin_domain ?? p.registered_origin_domain ?? "",
      signupOrigin: orgMap.get(a.client_id)?.signup_origin ?? "other",
      signupOriginLabel: orgMap.get(a.client_id)?.signup_origin === "partner" ? "Partner" : orgMap.get(a.client_id)?.signup_origin === "antheticplus" ? "AntheticPlus" : "Other",
      organizationName: orgMap.get(a.client_id)?.name ?? p.company_name ?? "",
      integrationFailure: intFail.has(a.id),
      providerFailures: providerFailures.get(a.id) ?? 0,
      automation_slug: a.automation_type,
      website_domain: a.domain_url,
      status,
      killed,
      billing_plan: s.plan_slug ?? a.automation_type,
      grace_days: s.grace_period_end ? Math.max(0, Math.ceil((new Date(s.grace_period_end).getTime() - Date.now()) / 86400000)) : 0,
      warning_sent: false,
      conversations_count: conversations.data?.filter((x: any) => x.automation_id === a.id).length ?? 0,
      leads_count: leadCounts.get(a.id) ?? 0,
      business_context: String(ai.behavior_config?.business_context ?? ""),
      system_prompt: prompt,
      prompt_override: prompt,
      subscription_status: s.status ?? null,
      subscription_expires_at: s.expires_at ?? null,
      installation_status: ins?.status ?? "none",
      installation_last_seen_at: ins?.last_seen_at ?? null,
      token_hint: a.script_token_last4 ?? script?.token_hint ?? "",
    };
  });
  return mapped;
});

export const adminUpdateAutomation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ automationId: z.string().uuid(), patch: z.record(z.string(), z.unknown()) }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: existing } = await db2Admin.from("client_automations").select("id,client_id").eq("id", data.automationId).maybeSingle();
  if (!existing) throw new Error("Automation not found");
  if (!context.tenant.isSuperAdmin && existing.client_id !== context.tenant.clientId) throw new Response("Forbidden", { status: 403 });
  const allowedKeys = new Set(["assigned_phone_number", "is_active", "run_state", "requires_reinstallation", "domain_url", "allowed_domains", "webhook_url", "name", "widget_config"]);
  const safePatch = Object.fromEntries(Object.entries(data.patch).filter(([k]) => allowedKeys.has(k)));
  const { data: before } = await db2Admin.from("client_automations").select("*").eq("id", data.automationId).maybeSingle();
  const { error } = await db2Admin.from("client_automations").update(safePatch).eq("id", data.automationId);
  if (error) throw new Error(error.message);
  await auditMutation(context, { action: "automation.updated", targetId: data.automationId, targetType: "automation", before, after: safePatch, clientId: existing.client_id });
  return { ok: true };
});

export const adminExtendAutomationLifecycle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ automationId: z.string().uuid(), days: z.number().int().min(1).max(3650), graceDays: z.number().int().min(0).max(365).optional() }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: a } = await db2Admin.from("client_automations").select("id,client_id,subscription_id,expires_at,renewal_at").eq("id", data.automationId).maybeSingle();
  if (!a || (!context.tenant.isSuperAdmin && a.client_id !== context.tenant.clientId)) throw new Response("Forbidden", { status: 403 });
  const base = a.expires_at && new Date(a.expires_at) > new Date() ? new Date(a.expires_at) : new Date();
  const next = new Date(base.getTime() + data.days * 86400000).toISOString();
  const grace = data.graceDays === undefined ? undefined : new Date(new Date(next).getTime() + data.graceDays * 86400000).toISOString();
  if (a.subscription_id) await db2Admin.from("subscriptions").update({ expires_at: next, renewal_at: next, ...(grace ? { grace_period_end: grace } : {}), status: "active" }).eq("id", a.subscription_id);
  await db2Admin.from("client_automations").update({ expires_at: next, renewal_at: next, run_state: "active", is_active: true }).eq("id", a.id);
  await auditMutation(context, { action: "automation.lifecycle.extended", targetId: a.id, targetType: "automation", after: { days: data.days, expires_at: next, grace_period_end: grace ?? null }, clientId: a.client_id });
  return { ok: true, expiresAt: next, gracePeriodEnd: grace ?? null };
});

export const adminSetAutomationKill = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ automationId: z.string().uuid(), killed: z.boolean(), reason: z.string().max(500).optional() }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: a } = await db2Admin.from("client_automations").select("id,client_id,run_state,is_active").eq("id", data.automationId).maybeSingle();
  if (!a || (!context.tenant.isSuperAdmin && a.client_id !== context.tenant.clientId)) throw new Response("Forbidden", { status: 403 });
  const next = data.killed ? "paused" : "active";
  const result = await db2Admin.rpc("set_automation_runtime_state", { p_automation_id: a.id, p_state: next, p_reason: data.reason ?? "admin control" , p_actor_user_id: context.userId });
  if (result.error) throw new Error(result.error.message);
  if (!data.killed) await db2Admin.from("client_automations").update({ is_active: true }).eq("id", a.id);
  await auditMutation(context, { action: data.killed ? "automation.kill.engaged" : "automation.kill.released", targetId: a.id, targetType: "automation", after: { run_state: next, reason: data.reason ?? null }, clientId: a.client_id });
  return { ok: true, runState: next };
});

export const adminSetAutomationPrompt = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ automationId: z.string().uuid(), prompt: z.string().max(20000) }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: a } = await db2Admin.from("client_automations").select("id,client_id").eq("id", data.automationId).maybeSingle();
  if (!a || (!context.tenant.isSuperAdmin && a.client_id !== context.tenant.clientId)) throw new Response("Forbidden", { status: 403 });
  const { data: current } = await db3Admin.from("prompt_versions").select("version").eq("prompt_key", `automation:${a.id}`).eq("automation_id", a.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = Number(current?.version ?? 0) + 1;
  await db3Admin.from("prompt_versions").update({ is_active: false }).eq("prompt_key", `automation:${a.id}`).eq("automation_id", a.id);
  const { error } = await db3Admin.from("prompt_versions").insert({ prompt_key: `automation:${a.id}`, automation_id: a.id, version, content: data.prompt, is_active: true, created_by_user_id: context.userId });
  if (error) throw new Error(error.message);
  const { error: cfgError } = await db3Admin.from("ai_configs").upsert({ automation_id: a.id, client_id: a.client_id, system_prompt: data.prompt, status: "active", behavior_config: {} }, { onConflict: "automation_id" });
  if (cfgError) throw new Error(cfgError.message);
  await auditMutation(context, { action: "automation.prompt.updated", targetId: a.id, targetType: "automation", after: { prompt_length: data.prompt.length }, clientId: a.client_id });
  return { ok: true, version };
});

export const adminListPricing = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db2Admin.from("pricing_plans").select("*").order("monthly_price", { ascending: true }); if (error) throw new Error(error.message); return data ?? []; });
export const adminSavePricing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ slug: z.string().min(2).max(80), name: z.string().min(2).max(100), monthly_price: z.number().min(0), yearly_price: z.number().min(0).nullable().optional(), yearly_discount_pct: z.number().min(0).max(100).optional(), active: z.boolean(), listed: z.boolean().optional(), description: z.string().max(600).optional() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { yearly_discount_pct, ...rest } = data; const yearly_price = data.yearly_price ?? Number((data.monthly_price * 12 * (1 - (yearly_discount_pct ?? 20) / 100)).toFixed(2)); const { error } = await db2Admin.from("pricing_plans").upsert({ ...rest, yearly_price }, { onConflict: "slug" }); if (error) throw new Error(error.message); await auditMutation(context, { action: "pricing.updated", targetId: null, targetType: "pricing_plan", after: { ...rest, yearly_price } }); return { ok: true }; });
export const adminListPromos = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db2Admin.from("promo_codes").select("*").order("created_at", { ascending: false }); if (error) throw new Error(error.message); return data ?? []; });
export const adminUpdatePromo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { error } = await db2Admin.from("promo_codes").update({ active: data.active }).eq("id", data.id); if (error) throw new Error(error.message); await auditMutation(context, { action: "promo.updated", targetId: data.id, targetType: "promo_code", after: { active: data.active } }); return { ok: true }; });
export const adminDeletePromo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { error } = await db2Admin.from("promo_codes").delete().eq("id", data.id); if (error) throw new Error(error.message); await auditMutation(context, { action: "promo.deleted", targetId: data.id, targetType: "promo_code" }); return { ok: true }; });
export const adminCreatePromo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ code: z.string().trim().min(2).max(80), percent_off: z.number().int().min(1).max(90), expires_at: z.string().datetime().nullable() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { data: row, error } = await db2Admin.from("promo_codes").insert({ code: data.code.toUpperCase(), percent_off: data.percent_off, expires_at: data.expires_at, active: true }).select("*").single(); if (error) throw new Error(error.message); return row; });

export const adminListPaymentMethods = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db2Admin.from("payment_methods").select("*").order("created_at"); if (error) throw new Error(error.message); return data ?? []; });
export const adminSavePaymentMethod = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ id: z.string().uuid().nullable(), method_name: z.string().min(2).max(120), instructions: z.string().max(3000), required_fields: z.array(z.string().max(100)).max(20), is_active: z.boolean().default(true) }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const row = { method_name: data.method_name, instructions: data.instructions, required_fields: data.required_fields, is_active: data.is_active }; const { error } = data.id ? await db2Admin.from("payment_methods").update(row).eq("id", data.id) : await db2Admin.from("payment_methods").insert(row); if (error) throw new Error(error.message); return { ok: true }; });

export const adminRunLifecycle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const now = Date.now();
  const { data: subs, error } = await db2Admin.from("subscriptions").select("id,client_id,automation_id,status,expires_at,grace_period_end");
  if (error) throw new Error(error.message);
  let expired = 0, suspended = 0;
  for (const s of subs ?? []) {
    if (!s.expires_at || new Date(s.expires_at).getTime() > now) continue;
    const inGrace = !!s.grace_period_end && new Date(s.grace_period_end).getTime() >= now;
    const next = inGrace ? "suspended" : "expired";
    if (s.status !== next) {
      await db2Admin.from("subscriptions").update({ status: next }).eq("id", s.id);
      if (next === "expired") expired++; else suspended++;
      await db2Admin.from("client_automations").update({ run_state: next, is_active: false }).eq("id", s.automation_id);
      await db2Admin.rpc("enqueue_outbox", { p_event_type: `subscription.${next}`, p_aggregate_type: "subscription", p_aggregate_id: s.id, p_idempotency_key: `subscription:${s.id}:${next}:${String(s.expires_at)}`, p_payload: { client_id: s.client_id, automation_id: s.automation_id, automation_ids: s.automation_id ? [s.automation_id] : [] } });
    }
  }
  await auditMutation(context, { action: "billing.lifecycle.run", targetId: null, targetType: "platform", after: { expired, suspended } });
  return { ok: true, expired, suspended };
});

export const adminListPrompts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const { data, error } = await db3Admin.from("prompt_versions").select("prompt_key,version,content,is_active,created_at,automation_id").order("prompt_key").order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const latest = new Map<string, any>();
  for (const row of data ?? []) if (!row.automation_id && !latest.has(row.prompt_key)) latest.set(row.prompt_key, row);
  return [...latest.values()].map((r) => ({ ...r, key: r.prompt_key }));
});

export const adminSavePrompt = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ key: z.string().min(1).max(120), content: z.string().max(20000) }).parse(d)).handler(async ({ data, context }) => { assertOwner(context); const { data: current } = await db3Admin.from("prompt_versions").select("version").eq("prompt_key", data.key).is("automation_id", null).order("version", { ascending: false }).limit(1).maybeSingle(); const version = Number(current?.version ?? 0) + 1; await db3Admin.from("prompt_versions").update({ is_active: false }).eq("prompt_key", data.key).is("automation_id", null); const { error } = await db3Admin.from("prompt_versions").insert({ prompt_key: data.key, version, content: data.content, is_active: true, created_by_user_id: context.userId }); if (error) throw new Error(error.message); await auditMutation(context, { action: "prompt.baseline.updated", targetId: null, targetType: "prompt", after: { key: data.key, version } }); return { ok: true, version }; });

export const adminListStaffInvites = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db1Admin.from("staff_invites").select("*").order("created_at", { ascending: false }); if (error) throw new Error(error.message); return data ?? []; });
export const adminRevokeStaffInvite = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { error } = await db1Admin.from("staff_invites").update({ status: "revoked" }).eq("id", data.id); if (error) throw new Error(error.message); return { ok: true }; });

export const getSystemSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const [{ data: platform, error: pErr }, { data: flags, error: fErr }] = await Promise.all([
    db1Admin.from("platform_settings").select("key,value"),
    db1Admin.from("feature_flags").select("key,is_enabled,rules"),
  ]);
  if (pErr) throw new Error(pErr.message); if (fErr) throw new Error(fErr.message);
  const out: Record<string, any> = {};
  for (const r of (platform ?? [])) out[r.key] = r.value;
  out.feature_flags = Object.fromEntries((flags ?? []).map((f: any) => [f.key, f.is_enabled]));
  return out;
});

export const adminSaveSetting = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ key: z.enum(["banner", "maintenance", "feature_flags"]), value: z.record(z.string(), z.unknown()) }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  if (data.key === "feature_flags") {
    for (const [key, enabled] of Object.entries(data.value)) {
      await db1Admin.from("feature_flags").upsert({ key, is_enabled: Boolean(enabled), updated_by: context.userId }, { onConflict: "key" });
    }
  } else {
    const { error } = await db1Admin.from("platform_settings").upsert({ key: data.key, value: data.value, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
  }
  await auditMutation(context, { action: "settings.updated", targetId: null, targetType: data.key, after: data.value });
  return { ok: true };
});

export const adminSetFeatureFlag = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ key: z.string().min(1).max(100), enabled: z.boolean() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { error } = await db1Admin.from("feature_flags").upsert({ key: data.key, is_enabled: data.enabled, updated_by: context.userId }, { onConflict: "key" }); if (error) throw new Error(error.message); await auditMutation(context, { action: "feature_flag.updated", targetId: null, targetType: "feature_flag", after: { key: data.key, enabled: data.enabled } }); return { ok: true }; });

export const adminListCrm = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const [{ data: profiles }, { data: autos }, { data: payments }, { data: tags }] = await Promise.all([
    db1Admin.from("profiles").select("id,user_id,client_id,company_name,company_email,website_url,category,full_name"),
    db2Admin.from("client_automations").select("client_id,run_state,is_active,expires_at"),
    db2Admin.from("orders").select("client_id,total_amount,status"),
    db4Admin.from("client_tags").select("id,client_id,tag"),
  ]);
  return (profiles ?? []).map((p: any) => {
    const a = (autos ?? []).filter((x: any) => x.client_id === p.client_id);
    const pay = (payments ?? []).filter((x: any) => x.client_id === p.client_id && x.status === "approved");
    return { profile: p, revenue: pay.reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0), automationsCount: a.length, liveCount: a.filter((x: any) => x.run_state === "active" && x.is_active && (!x.expires_at || new Date(x.expires_at) > new Date())).length, tags: (tags ?? []).filter((t: any) => t.client_id === p.client_id) };
  });
});
export const adminAddCrmTag = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ clientId: z.string().uuid(), tag: z.string().trim().min(1).max(80) }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { error } = await db4Admin.from("client_tags").insert({ client_id: data.clientId, tag: data.tag }); if (error) throw new Error(error.message); await auditMutation(context, { action: "crm.tag.added", targetId: data.clientId, targetType: "client", after: { tag: data.tag }, clientId: data.clientId }); return { ok: true }; });
export const adminRemoveCrmTag = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => { assertAdmin(context); const { data: row } = await db4Admin.from("client_tags").select("id,client_id,tag").eq("id", data.id).maybeSingle(); const { error } = await db4Admin.from("client_tags").delete().eq("id", data.id); if (error) throw new Error(error.message); await auditMutation(context, { action: "crm.tag.removed", targetId: data.id, targetType: "client_tag", after: row ?? {}, clientId: row?.client_id ?? null }); return { ok: true }; });

export const adminReviewOrder = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ orderId: z.string().uuid(), approve: z.boolean(), reason: z.string().max(500).default("") }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: pv, error: pvError } = await db2Admin.from("payment_verifications").select("id,client_id,status,order_id").eq("order_id", data.orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pvError) throw new Error(pvError.message); if (!pv) throw new Error("Payment verification not found.");
  const next = data.approve ? "approved" : "rejected";
  const { error } = await db2Admin.from("payment_verifications").update({ status: next, rejection_reason: data.approve ? null : data.reason, verified_by_user_id: context.userId, verified_at: new Date().toISOString() }).eq("id", pv.id);
  if (error) throw new Error(error.message);
  await db2Admin.from("orders").update({ status: data.approve ? "verified" : "rejected", verified_by: data.approve ? context.userId : null, verified_at: data.approve ? new Date().toISOString() : null, rejected_at: data.approve ? null : new Date().toISOString(), rejection_reason: data.approve ? null : data.reason }).eq("id", data.orderId);
  await auditMutation(context, { action: data.approve ? "order.approved" : "order.rejected", targetId: data.orderId, targetType: "order", after: { reason: data.reason }, clientId: pv.client_id });
  if (!data.approve) return { ok: true, crawled: false, snippet: "" };
  const { runProvisioningPipeline } = await import("./provisioning.server");
  const origin = new URL((await import("@tanstack/react-start/server")).getRequest().url).origin;
  return { ok: true, ...(await runProvisioningPipeline(pv.id, context.userId, origin)) };
});

export const adminListProfiles = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db1Admin.from("profiles").select("*").order("created_at", { ascending: false }); if (error) throw new Error(error.message); return data ?? []; });
export const adminListTags = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db4Admin.from("client_tags").select("id,client_id,tag,created_at").order("created_at", { ascending: false }); if (error) throw new Error(error.message); return data ?? []; });
export const adminListRoles = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db1Admin.from("user_roles").select("user_id,role,created_at"); if (error) throw new Error(error.message); return data ?? []; });
export const adminListAudit = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db1Admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw new Error(error.message); return data ?? []; });
export const adminListUsage = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const { data, error } = await db3Admin.from("llm_requests").select("id,automation_id,client_id,provider_key,model,status,http_status,tokens_in,tokens_out,latency_ms,error,created_at,key_id").order("created_at", { ascending: false }).limit(1500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, tokens_used: Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0) }));
});
export const adminListTranscripts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  const [{ data: convs, error: cErr }, { data: messages, error: mErr }] = await Promise.all([
    db4Admin.from("conversations").select("id,automation_id,client_id,channel,status,created_at,last_message_at,summary,extracted_lead_data,visitor_session,customer_phone_or_id,origin").order("created_at", { ascending: false }).limit(500),
    db4Admin.from("messages").select("conversation_id,role,content,created_at").order("created_at", { ascending: true }).limit(5000),
  ]);
  if (cErr) throw new Error(cErr.message); if (mErr) throw new Error(mErr.message);
  return (convs ?? []).map((c: any) => ({ ...c, visitor: c.customer_phone_or_id ?? c.visitor_session ?? c.origin ?? "Anonymous visitor", messages: (messages ?? []).filter((m: any) => m.conversation_id === c.id) }));
});
export const adminListFailoverLog = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { assertAdmin(context); const { data, error } = await db3Admin.from("llm_requests").select("id,provider_key,http_status,status,error,created_at,latency_ms,key_id").in("status", ["error", "timeout", "rate_limited"]).order("created_at", { ascending: false }).limit(500); if (error) throw new Error(error.message); return (data ?? []).map((r: any) => ({ ...r, status_code: r.http_status, message: r.error ?? r.status })); });
