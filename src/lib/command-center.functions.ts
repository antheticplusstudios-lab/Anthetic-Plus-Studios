import { ORDER_SELECT, normalizeOrder, orderStatusToDb, newOrderNumber } from "@/lib/orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { db1Admin, db2Admin, db3Admin, db4Admin } from "@/server/db/clients.server";
import { encryptSecret } from "@/server/security/envelope.server";
import { DEFAULT_WIDGET_CONFIG, normalizeWidgetConfig, type WidgetConfig } from "@/lib/widget-config";

/**
 * Admin Command Center server API (Gen 2 only).
 * Every function re-checks the caller's role server-side; mutations run through
 * SECURITY DEFINER RPCs that re-authorize, enforce partner scope and write audit_logs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function canManageAutomation(context: any, automationId: string) {
  assertAdmin(context);
  if (context.tenant.isSuperAdmin) return true;
  const { data: automation } = await db2Admin.from("client_automations").select("id,client_id,origin_domain").eq("id", automationId).maybeSingle();
  if (!automation) return false;
  if (automation.client_id === context.tenant.clientId) return true;
  const { data: org } = await db1Admin.from("organizations").select("origin_domain").eq("id", context.tenant.organizationId).maybeSingle();
  return !!org?.origin_domain && String(automation.origin_domain ?? "").toLowerCase() === String(org.origin_domain).toLowerCase();
}

function originLabel(domain: string, partners: Map<string, string>) {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d) return { kind: "direct", label: "DIRECT" };
  const p = partners.get(d);
  if (p) return { kind: "partner", label: `PARTNER: ${p}`, domain: d };
  return { kind: "other", label: `OTHER: ${d}`, domain: d };
}

async function partnerMap(admin: any) {
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "partner");
  const ids = ((roles ?? []) as Row[]).map((r) => r.user_id);
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data: profs } = await admin.from("profiles").select("user_id, company_name, full_name, registered_origin_domain").in("user_id", ids);
  for (const p of (profs ?? []) as Row[]) if (p.registered_origin_domain) map.set(String(p.registered_origin_domain).toLowerCase(), p.company_name || p.full_name || p.registered_origin_domain);
  return map;
}

async function scope(context: any) {
  await assertAdmin(context);
  const { createMultiDbAdminFacade } = await import("@/server/db/facade.server");
  const admin = createMultiDbAdminFacade();
  const { data: org } = await admin.from("organizations").select("origin_domain").eq("id", context.tenant.organizationId).maybeSingle();
  return { admin: admin as any, isOwner: context.tenant.isSuperAdmin, myDomain: String(org?.origin_domain ?? "") };
}

// ---------------- Users ----------------

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, isOwner, myDomain } = await scope(context);
    const [authUsers, profiles, roles, restr, autos, partners] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("profiles").select("*"),
      admin.from("user_roles").select("user_id, role"),
      admin.from("account_restrictions").select("*"),
      admin.from("client_automations").select("client_id, is_active, run_state, expires_at"),
      partnerMap(admin),
    ]);
    const roleMap = new Map<string, string[]>();
    for (const r of (roles.data ?? []) as Row[]) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    const rMap = new Map(((restr.data ?? []) as Row[]).map((r) => [r.user_id, r]));
    const pMap = new Map(((profiles.data ?? []) as Row[]).map((p) => [p.user_id, p]));
    const aByClient = new Map<string, Row[]>();
    for (const a of (autos.data ?? []) as Row[]) aByClient.set(a.client_id, [...(aByClient.get(a.client_id) ?? []), a]);
    const users = ((authUsers.data?.users ?? []) as Row[])
      .map((u) => {
        const p = pMap.get(u.id) ?? {};
        const r = rMap.get(u.id);
        const list = aByClient.get(p.client_id) ?? [];
        const active = list.filter((a) => a.run_state === "active" && a.is_active);
        const nextExp = list.map((a) => a.expires_at).filter(Boolean).sort()[0] ?? null;
        const expired = list.some((a) => a.expires_at && new Date(a.expires_at) < new Date());
        return {
          id: u.id as string,
          email: (u.email ?? "") as string,
          name: (p.full_name || u.user_metadata?.full_name || "") as string,
          company: (p.company_name ?? "") as string,
          clientId: (p.client_id ?? "") as string,
          roles: roleMap.get(u.id) ?? [],
          status: (r?.status ?? "active") as string,
          muted: !!r?.muted,
          restrictionReason: (r?.reason ?? null) as string | null,
          originDomain: (p.registered_origin_domain ?? "") as string,
          origin: originLabel(p.registered_origin_domain ?? "", partners),
          createdAt: u.created_at as string,
          lastActivity: (u.last_sign_in_at ?? null) as string | null,
          emailConfirmed: !!u.email_confirmed_at,
          automations: list.length,
          activeAutomations: active.length,
          subscription: list.length === 0 ? "none" : expired ? "expired" : active.length ? "active" : "inactive",
          nextExpiration: nextExp as string | null,
        };
      })
      .filter((u) => isOwner || u.originDomain === myDomain);
    return { users };
  });

export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, isOwner, myDomain } = await scope(context);
    const { data: au } = await admin.auth.admin.getUserById(data.userId);
    if (!au?.user) throw new Error("User not found");
    const { data: p } = await admin.from("profiles").select("*").eq("user_id", data.userId).maybeSingle();
    if (!isOwner && (p?.registered_origin_domain ?? "") !== myDomain) throw new Error("Outside your partner scope");
    const cid = p?.client_id ?? "__none__";
    const partners = await partnerMap(admin);
    const [roles, restr, orders, autos, audit] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", data.userId),
      admin.from("account_restrictions").select("*").eq("user_id", data.userId).maybeSingle(),
      admin.from("orders").select(ORDER_SELECT as "*").eq("client_id", cid).order("created_at", { ascending: false }),
      admin.from("client_automations").select("id, automation_type, domain_url, run_state, is_active, expires_at, created_at, last_seen_at, requires_reinstallation").eq("client_id", cid),
      admin.from("audit_logs").select("*").or(`target_id.eq.${data.userId},client_id.eq.${cid}`).order("created_at", { ascending: false }).limit(100),
    ]);
    const autoIds = ((autos.data ?? []) as Row[]).map((a) => a.id);
    const [usage, convs, kb, ints, health] = autoIds.length
      ? await Promise.all([
          admin.from("usage_meters").select("*").in("automation_id", autoIds),
          admin.from("conversations").select("id, automation_id, channel, status, created_at, last_message_at").in("automation_id", autoIds).order("last_message_at", { ascending: false }).limit(50),
          admin.from("kb_documents").select("id, automation_id, source_type, source_name, created_at").in("automation_id", autoIds),
          admin.from("integration_connections").select("automation_id, provider, status, updated_at").in("automation_id", autoIds),
          admin.from("automation_health").select("*").in("automation_id", autoIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
    const u = au.user as Row;
    return {
      user: {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        emailConfirmed: !!u.email_confirmed_at,
        provider: u.app_metadata?.provider ?? "email",
        bannedUntil: u.banned_until ?? null,
      },
      profile: p,
      origin: originLabel(p?.registered_origin_domain ?? "", partners),
      roles: ((roles.data ?? []) as Row[]).map((r) => r.role as string),
      restriction: restr.data ?? null,
      orders: orders.data ?? [],
      automations: autos.data ?? [],
      usage: usage.data ?? [],
      conversations: convs.data ?? [],
      knowledge: kb.data ?? [],
      integrations: ints.data ?? [],
      health: health.data ?? [],
      audit: audit.data ?? [],
    };
  });

const ModAction = z.enum(["suspend", "unsuspend", "ban", "unban", "mute", "unmute", "activate", "deactivate", "force_signout"]);

export const moderateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ userId: z.string().uuid(), action: ModAction, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Authorization, partner scope, DB state and audit happen inside the RPC as the caller.
    const { data: after, error } = await db1Admin.rpc("admin_moderate_user", { p_actor_user_id: context.userId, p_target_user_id: data.userId, p_action: data.action, p_reason: data.reason });
    if (error) throw new Error(error.message);
    // Mirror to the auth service so blocked users cannot obtain new sessions.
    const { db1Admin: supabaseAdmin } = await import("@/server/db/clients.server");
    const status = (after as Row)?.status as string;
    const ban = status === "active" ? "none" : "876000h";
    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: ban } as never);
    return { ok: true, status, muted: (after as Row)?.muted, authSync: aErr ? aErr.message : "ok" };
  });

// ---------------- Automations ----------------

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, isOwner, myDomain } = await scope(context);
    let q = admin.from("client_automations").select("*").order("created_at", { ascending: false });
    if (!isOwner) q = q.eq("origin_domain", myDomain);
    const { data: autos, error } = await q;
    if (error) throw new Error(error.message);
    const list = (autos ?? []) as Row[];
    const ids = list.map((a) => a.id);
    const cids = [...new Set(list.map((a) => a.client_id))];
    const period = new Date().toISOString().slice(0, 7);
    const [profiles, health, usage, convs, ints, llmErr, installations, runtime, partners] = await Promise.all([
      cids.length ? admin.from("profiles").select("client_id, user_id, full_name, company_name, registered_origin_domain").in("client_id", cids) : { data: [] },
      ids.length ? admin.from("automation_health").select("*").in("automation_id", ids) : { data: [] },
      ids.length ? admin.from("usage_meters").select("automation_id, tokens_used, call_minutes_used, sms_count_used").eq("billing_period", period).in("automation_id", ids) : { data: [] },
      ids.length ? admin.from("conversations").select("automation_id, channel, last_message_at").in("automation_id", ids).order("last_message_at", { ascending: false }).limit(2000) : { data: [] },
      ids.length ? admin.from("integration_connections").select("automation_id, provider, status").in("automation_id", ids) : { data: [] },
      ids.length ? admin.from("llm_requests").select("automation_id").eq("status", "error").gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).in("automation_id", ids) : { data: [] },
      ids.length ? admin.from("automation_installations").select("automation_id,status,installed_at,last_seen_at").in("automation_id", ids).order("created_at", { ascending: false }) : { data: [] },
      Promise.all(ids.map(async (id) => [id, String((await db2Admin.rpc("automation_local_runtime_state", { p_automation_id: id })).data?.state ?? "")] as const)),
      partnerMap(admin),
    ]);
    const pMap = new Map(((profiles.data ?? []) as Row[]).map((p) => [p.client_id, p]));
    const hMap = new Map(((health.data ?? []) as Row[]).map((h) => [h.automation_id, h]));
    const uMap = new Map(((usage.data ?? []) as Row[]).map((u) => [u.automation_id, u]));
    const rtMap = new Map(runtime);
    const installMap = new Map(((installations.data ?? []) as Row[]).filter((i) => i.status === "active" || i.installed_at).map((i) => [i.automation_id, i]));
    const last = new Map<string, string>();
    const channels = new Map<string, Set<string>>();
    for (const c of (convs.data ?? []) as Row[]) {
      if (!last.has(c.automation_id)) last.set(c.automation_id, c.last_message_at);
      channels.set(c.automation_id, (channels.get(c.automation_id) ?? new Set()).add(c.channel));
    }
    const intFail = new Set(((ints.data ?? []) as Row[]).filter((i) => i.status !== "connected").map((i) => i.automation_id));
    const provFail = new Map<string, number>();
    for (const r of (llmErr.data ?? []) as Row[]) provFail.set(r.automation_id, (provFail.get(r.automation_id) ?? 0) + 1);
    return {
      automations: list.map((a) => {
        const p = pMap.get(a.client_id) ?? {};
        const h = hMap.get(a.id);
        const exp = a.expires_at ? Math.ceil((new Date(a.expires_at).getTime() - Date.now()) / 86_400_000) : null;
        return {
          id: a.id as string,
          clientId: a.client_id as string,
          ownerUserId: (p.user_id ?? null) as string | null,
          clientName: (p.full_name ?? "") as string,
          company: (p.company_name ?? "") as string,
          type: a.automation_type as string,
          orderId: a.order_id as string | null,
          domain: a.domain_url as string,
          runState: a.run_state as string,
          runtime: rtMap.get(a.id) ?? "",
          isActive: !!a.is_active,
          health: (h?.overall ?? "UNCHECKED") as string,
          healthSummary: (h?.summary ?? "") as string,
          healthCheckedAt: (h?.checked_at ?? null) as string | null,
          createdAt: a.created_at as string,
          expiresAt: a.expires_at as string | null,
          renewalAt: a.expires_at as string | null,
          daysRemaining: exp,
          tokens: Number(uMap.get(a.id)?.tokens_used ?? 0),
          channels: [...(channels.get(a.id) ?? [])],
          phone: (a.assigned_phone_number ?? null) as string | null,
          lastActivity: last.get(a.id) ?? a.last_seen_at ?? null,
          installed: installMap.has(a.id),
          requiresReinstallation: !!a.requires_reinstallation,
          origin: originLabel(a.origin_domain || p.registered_origin_domain || "", partners),
          integrationFailure: intFail.has(a.id),
          providerFailures: provFail.get(a.id) ?? 0,
        };
      }),
    };
  });

export const getAutomationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await scope(context);
    const can = await canManageAutomation(context, data.id);
    if (!can) throw new Error("Not authorized for this automation");
    const { data: a } = await admin.from("client_automations").select("*").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Automation not found");
    const partners = await partnerMap(admin);
    const [
      profile, order, subscription, installations, tasks, kb, crawls, convs, usage, ints, health, checks, state, llm, audit, scripts,
      aiConfig, prompts, providers, rrTeams, convDiagnostics, workflows, workflowRuns, runtime,
    ] = await Promise.all([
      admin.from("profiles").select("*").eq("client_id", a.client_id).maybeSingle(),
      a.order_id ? admin.from("orders").select(ORDER_SELECT as "*").eq("id", a.order_id).maybeSingle() : { data: null },
      admin.from("subscriptions").select("*").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("automation_installations").select("id,domain,status,installed_at,verified_at,revoked_at,replaced_by_installation_id,last_seen_at,last_seen_origin,created_at").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(20),
      admin.from("automation_tasks").select("*").eq("automation_id", a.id),
      admin.from("kb_documents").select("id, source_type, source_name, priority, status, created_at").eq("automation_id", a.id),
      admin.from("crawl_jobs").select("*").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(20),
      admin.from("conversations").select("id, channel, status, customer_phone_or_id, origin, assigned_user_id, assigned_team_id, created_at, last_message_at, extracted_lead_data").eq("automation_id", a.id).order("last_message_at", { ascending: false }).limit(50),
      admin.from("usage_meters").select("*").eq("automation_id", a.id).order("billing_period", { ascending: false }),
      admin.from("integration_connections").select("provider, account_label, status, last_verified_at, last_error, updated_at").eq("automation_id", a.id),
      admin.from("automation_health").select("*").eq("automation_id", a.id).maybeSingle(),
      admin.from("automation_health_checks").select("*").eq("automation_id", a.id).order("checked_at", { ascending: false }).limit(120),
      admin.from("automation_health_state").select("*").eq("automation_id", a.id),
      admin.from("llm_requests").select("id, provider_key, model, status, http_status, latency_ms, tokens_in, tokens_out, error, created_at").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(50),
      admin.from("audit_logs").select("*").eq("target_id", a.id).order("created_at", { ascending: false }).limit(100),
      admin.from("script_generations").select("*").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(20),
      admin.from("ai_configs").select("automation_id,client_id,primary_provider,primary_model,fallback_providers,system_prompt,behavior_config,temperature,max_tokens,top_p,retrieval_enabled,retrieval_top_k,semantic_cache_enabled,status,config_version,updated_by_user_id,updated_at").eq("automation_id", a.id).maybeSingle(),
      admin.from("prompt_versions").select("prompt_key,version,content,is_active,created_by_user_id,created_at").eq("automation_id", a.id).order("version", { ascending: false }).limit(30),
      admin.from("llm_providers").select("provider_key,display_name,base_url,status,priority,default_model,metadata,updated_at").order("priority"),
      admin.from("round_robin_teams").select("id,name,assignment_strategy,is_active,priority,fallback_member_id,overflow_behavior,business_hours,settings,created_at,updated_at").eq("client_id", a.client_id),
      admin.from("conversation_diagnostics").select("id,conversation_id,severity,what_went_wrong,recommended_fix,created_by_user_id,created_at").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(50),
      admin.from("workflow_definitions").select("id,name,status,version,trigger_type,trigger_config,created_at,updated_at").eq("client_id", a.client_id).eq("automation_id", a.id).order("created_at", { ascending: false }).limit(50),
      admin.from("workflow_runs").select("id,workflow_id,status,current_step_order,attempt_count,last_error,queued_at,started_at,completed_at,resume_at,updated_at").eq("client_id", a.client_id).eq("automation_id", a.id).order("queued_at", { ascending: false }).limit(50),
      db2Admin.rpc("automation_local_runtime_state", { p_automation_id: a.id }),
    ]);
    const teamIds = ((rrTeams.data ?? []) as Row[]).map((x) => x.id);
    const conversationIds = ((convs.data ?? []) as Row[]).map((x) => x.id);
    const [rrMembers, rrRules, rrAssignments] = await Promise.all([
      teamIds.length ? admin.from("round_robin_members").select("id,team_id,user_id,external_assignee_key,display_name,priority,weight,availability_status,is_active,max_active,max_daily,current_active,assigned_today,metadata,updated_at").in("team_id", teamIds).limit(500) : { data: [] as Row[] },
      teamIds.length ? admin.from("round_robin_rules").select("id,team_id,event_type,priority,conditions,enabled,created_at,updated_at").in("team_id", teamIds).limit(500) : { data: [] as Row[] },
      conversationIds.length ? admin.from("round_robin_assignments").select("id,team_id,member_id,subject_type,subject_id,status,assigned_at,released_at,strategy,metadata").eq("subject_type", "conversation").in("subject_id", conversationIds).order("assigned_at", { ascending: false }).limit(100) : { data: [] as Row[] },
    ]);
    const { hmac_secret_ciphertext, script_token_hash, ...safe } = a as Row;
    const leads = ((convs.data ?? []) as Row[]).filter((c) => c.extracted_lead_data && Object.keys(c.extracted_lead_data).length);
    return {
      automation: { ...safe, token_hint: String(a.script_token_last4 ?? ""), hmac_set: !!hmac_secret_ciphertext },
      runtime: String((runtime.data as Row)?.state ?? ""),
      subscription: subscription.data ?? null,
      installations: installations.data ?? [],
      aiConfig: aiConfig.data ?? null,
      prompts: prompts.data ?? [],
      providers: providers.data ?? [],
      rrTeams: rrTeams.data ?? [],
      rrMembers: rrMembers.data ?? [],
      rrRules: rrRules.data ?? [],
      rrAssignments: rrAssignments.data ?? [],
      diagnostics: convDiagnostics.data ?? [],
      workflows: workflows.data ?? [],
      workflowRuns: workflowRuns.data ?? [],
      profile: profile.data,
      origin: originLabel(a.origin_domain || profile.data?.registered_origin_domain || "", partners),
      order: order.data,
      tasks: tasks.data ?? [],
      knowledge: kb.data ?? [],
      crawls: crawls.data ?? [],
      conversations: convs.data ?? [],
      leads,
      usage: usage.data ?? [],
      integrations: ints.data ?? [],
      health: health.data,
      checks: checks.data ?? [],
      healthState: state.data ?? [],
      llm: llm.data ?? [],
      audit: audit.data ?? [],
      scripts: scripts.data ?? [],
    };
  });

export const getConversationMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await db4Admin.from("messages").select("id, role, content, tokens_used, created_at").eq("conversation_id", data.conversationId).order("created_at");
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

const AutoAction = z.enum(["enable", "disable", "pause", "resume", "stop", "reinstall", "rotate_token", "rotate_hmac"]);

export const automationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), action: AutoAction, reason: z.string().trim().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: auto, error: fetchError } = await db2Admin.from("client_automations").select("client_id,run_state,is_active,requires_reinstallation").eq("id", data.id).maybeSingle();
    if (fetchError || !auto) throw new Error("Automation not found");
    if (!(await canManageAutomation(context, data.id))) throw new Error("Not authorized for this automation");
    const stateMap: Record<string,string> = { enable:"active", resume:"active", disable:"disabled", pause:"paused", stop:"stopped", reinstall:"active", rotate_token: String(auto.run_state), rotate_hmac: String(auto.run_state) };
    let after: any;
    if (["enable","resume","disable","pause","stop"].includes(data.action)) {
      const r = await db2Admin.rpc("set_automation_runtime_state", { p_automation_id:data.id, p_state:stateMap[data.action], p_reason:data.reason, p_idempotency_key:`admin-action:${data.id}:${data.action}:${Date.now()}`, p_actor_user_id:context.userId });
      if (r.error) throw r.error;
      after = r.data;
    } else if (data.action === "rotate_token" || data.action === "reinstall") {
      const r = await db2Admin.rpc("generate_automation_token", { p_automation_id:data.id, p_generated_by:context.userId });
      if (r.error) throw r.error;
      after = { token_generated: true, token: r.data };
    } else if (data.action === "rotate_hmac") {
      const rawSecret = `ap_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
      const cipher = encryptSecret(rawSecret);
      const r = await db2Admin.from("client_automations").update({ hmac_secret_ciphertext: cipher, hmac_key_version: 1 }).eq("id", data.id);
      if (r.error) throw r.error;
      after = { hmac_rotated: true, secret: rawSecret, deliver_once: true };
    } else { throw new Error("Unknown action"); }
    return { ok: true, after };
  });

export const runDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await scope(context);
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = (process.env["VITE_APP_URL"] ?? "").replace(/\/$/, "") || new URL(getRequest().url).origin;
    const { probeAutomation, probeAll } = await import("@/lib/health.server");
    if (data.id) {
      const can = await canManageAutomation(context, data.id);
      if (!can) throw new Error("Not authorized for this automation");
      const r = await probeAutomation(admin, data.id, origin);
      await auditMutation(context, { action: "automation.diagnostics", targetId: data.id, targetType: "automation", after: { overall: r.overall } });
      return { overall: r.overall, checks: r.results.length };
    }
    const all = await probeAll(admin, origin);
    return { overall: "batch", checks: all.length };
  });

/** Sends a real message through the production widget endpoint as the app itself. */
export const testAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), message: z.string().trim().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!(await canManageAutomation(context, data.id))) throw new Error("Not authorized for this automation");
    const { data: a, error } = await db2Admin.from("client_automations").select("id,client_id,automation_type,domain_url,allowed_domains,run_state,is_active,requires_reinstallation,expires_at,widget_config").eq("id", data.id).maybeSingle();
    if (error || !a) throw new Error("Automation not found");
    const { data: sub } = await db2Admin.from("subscriptions").select("status,expires_at,grace_period_end").eq("automation_id", data.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const expires = sub?.expires_at ? new Date(sub.expires_at).getTime() : Number.POSITIVE_INFINITY;
    if (['suspended','expired','canceled'].includes(String(sub?.status)) || expires <= Date.now()) throw new Error("Automation is not billing-eligible");
    const { data: ai } = await db3Admin.from("ai_configs").select("status").eq("automation_id", data.id).maybeSingle();
    if (String(ai?.status ?? "active") !== "active") throw new Error("AI configuration is disabled");
    const { buildSystemPrompt, adminClient } = await import("./widget.server");
    const { routeChat } = await import("./llm-router.server");
    const inst = { ...a, token: "admin-test", subscription_status: sub?.status ?? "active" };
    const system = await buildSystemPrompt(adminClient(), inst as any);
    const t0 = Date.now();
    const routed = await routeChat([{ role: "system", content: system }, { role: "user", content: data.message }], { automationId: a.id, clientId: a.client_id }, db3Admin);
    if (!routed) throw new Error("The assistant is temporarily unavailable");
    await auditMutation(context, { action: "automation.test", targetId: data.id, targetType: "automation", after: { latency_ms: Date.now() - t0, provider: routed.provider, model: routed.model } });
    return { status: 200, latencyMs: Date.now() - t0, reply: routed.reply, error: null };
  });

export const generateScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!(await canManageAutomation(context, data.id))) throw new Error("Not authorized for this automation");
    const { data: token, error } = await db2Admin.rpc("generate_automation_token", { p_automation_id: data.id, p_generated_by: context.userId });
    if (error) throw new Error(error.message);
    const { data: a } = await db2Admin.from("client_automations").select("client_id, order_id").eq("id", data.id).single();
    const { getRequest } = await import("@tanstack/react-start/server");
    const base = (process.env["VITE_APP_URL"] ?? "").replace(/\/$/, "") || new URL(getRequest().url).origin;
    const snippet = `<script\n  src="${base}/widget.js"\n  data-client-id="${a?.client_id ?? ""}"\n  data-order-id="${a?.order_id ?? ""}"\n  data-automation-id="${data.id}"\n  data-token="${token}"\n  async>\n</script>`;
    await auditMutation(context, { action: "automation.install_script.generated", targetId: data.id, targetType: "automation", after: { token_last4: String(token).slice(-4) } });
    return { snippet };
  });

// ---------------- Widget config ----------------

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const widgetStateConfigSchema = z.object({
  enabled: z.boolean(),
  speed: z.number().min(0).max(5),
  energy: z.number().min(0).max(3),
  color: hex.optional(),
});
const widgetStateMapSchema = z.object({
  idle: widgetStateConfigSchema, listening: widgetStateConfigSchema, thinking: widgetStateConfigSchema,
  speaking: widgetStateConfigSchema, message: widgetStateConfigSchema, success: widgetStateConfigSchema,
  handoff: widgetStateConfigSchema, error: widgetStateConfigSchema, offline: widgetStateConfigSchema,
}).partial();

export const WidgetConfigSchema = z.object({
  style: z.literal("metal-balls").default("metal-balls"),
  primary: hex.default(DEFAULT_WIDGET_CONFIG.primary),
  secondary: hex.default(DEFAULT_WIDGET_CONFIG.secondary),
  center: hex.default(DEFAULT_WIDGET_CONFIG.center),
  glow: hex.default(DEFAULT_WIDGET_CONFIG.glow),
  size: z.number().int().min(44).max(132).default(DEFAULT_WIDGET_CONFIG.size),
  position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
  ballCount: z.number().int().min(8).max(128).default(DEFAULT_WIDGET_CONFIG.ballCount),
  radius: z.number().min(8).max(60).default(DEFAULT_WIDGET_CONFIG.radius),
  ballSize: z.number().min(1).max(12).default(DEFAULT_WIDGET_CONFIG.ballSize),
  centerSize: z.number().min(3).max(70).default(DEFAULT_WIDGET_CONFIG.centerSize),
  tilt: z.number().min(0).max(180).default(DEFAULT_WIDGET_CONFIG.tilt),
  variation: z.number().min(0).max(1).default(DEFAULT_WIDGET_CONFIG.variation),
  shine: z.boolean().default(true),
  speed: z.number().min(0.1).max(4).default(DEFAULT_WIDGET_CONFIG.speed),
  stateAnimations: widgetStateMapSchema.default(DEFAULT_WIDGET_CONFIG.stateAnimations),
  labels: z.record(z.string(), z.string().max(120)).default(DEFAULT_WIDGET_CONFIG.labels),
  welcome: z.string().max(400).default(DEFAULT_WIDGET_CONFIG.welcome),
  placeholder: z.string().max(120).default(DEFAULT_WIDGET_CONFIG.placeholder),
  sound: z.boolean().default(false),
  chat: z.object({ title: z.string().max(60), subtitle: z.string().max(80), autoOpen: z.boolean() }).default(DEFAULT_WIDGET_CONFIG.chat),
  mobile: z.object({ hidden: z.boolean(), size: z.number().int().min(40).max(100) }).default(DEFAULT_WIDGET_CONFIG.mobile),
  desktop: z.object({ size: z.number().int().min(44).max(132) }).default(DEFAULT_WIDGET_CONFIG.desktop),
  fallback: z.object({ enabled: z.boolean(), type: z.literal("static") }).default(DEFAULT_WIDGET_CONFIG.fallback),
  advanced: z.object({ debug: z.boolean() }).default(DEFAULT_WIDGET_CONFIG.advanced),
  retrievalTopK: z.number().int().min(1).max(20).optional(),
  behavior: z.string().max(4000).optional(),
});

export const saveWidgetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), config: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!(await canManageAutomation(context, data.id))) throw new Error("Not authorized for this automation");
    const canonical = WidgetConfigSchema.parse(normalizeWidgetConfig(data.config)) as WidgetConfig;
    const { data: current, error: readError } = await db2Admin.from("client_automations").select("widget_config_version").eq("id", data.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    const version = Number(current?.widget_config_version ?? 0) + 1;
    const { error } = await db2Admin.from("client_automations").update({ widget_config: canonical, widget_config_version: version }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditMutation(context, { action: "automation.widget.updated", targetId: data.id, targetType: "automation", after: { widget_config_version: version, style: canonical.style } });
    return { ok: true, config: canonical, version };
  });

// ---------------- Orders ----------------

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, isOwner, myDomain } = await scope(context);
    let q = admin.from("orders").select(ORDER_SELECT as "*").order("created_at", { ascending: false });
    if (!isOwner) q = q.eq("origin_domain", myDomain);
    const [{ data: orders }, partners, { data: autos }] = await Promise.all([q, partnerMap(admin), admin.from("client_automations").select("id, order_id")]);
    const aMap = new Map(((autos ?? []) as Row[]).map((a) => [a.order_id, a.id]));
    return {
      orders: ((orders ?? []) as Row[]).map((o) => ({ ...o, automationId: aMap.get(o.order_id) ?? null, origin: originLabel(o.origin_domain ?? "", partners) })),
    };
  });
