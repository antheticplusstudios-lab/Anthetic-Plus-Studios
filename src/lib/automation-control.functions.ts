/* eslint-disable @typescript-eslint/no-explicit-any -- admin views read loosely-typed rows joined across DB2/DB3/DB4; validated server-side with zod on write. */
// Admin control-room API for the four canonical automations.
// DB2 = deployments/config, DB3 = provider keys + llm_requests, DB4 = executions. Admin-only, audited.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";

const KINDS = ["ai_receptionist", "lead_capture", "kb_support", "messaging_ai"] as const;
const RANGE_H = { "24h": 24, "7d": 168, "30d": 720, "90d": 2160 } as const;
type Row = Record<string, any>;

const poolSchema = z.object({
  strategy: z.enum(["balanced", "weighted", "priority"]),
  members: z
    .array(
      z.object({
        provider: z.enum(["groq", "openrouter", "openai", "anthropic"]),
        enabled: z.boolean(),
        weight: z.number().min(0).max(100),
        priority: z.number().int().min(1).max(99),
        model: z.string().max(120).nullable(),
      }),
    )
    .max(8),
});

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : null;
}

export function summarize(execs: Row[], llm: Row[]) {
  const done = execs.filter((e) => ["succeeded", "failed"].includes(e.status));
  const ok = execs.filter((e) => e.status === "succeeded").length;
  const failed = execs.filter((e) => e.status === "failed").length;
  const durations = execs
    .filter((e) => e.started_at && e.finished_at)
    .map((e) => new Date(e.finished_at).getTime() - new Date(e.started_at).getTime());
  const providers: Record<string, { total: number; errors: number; latency: number }> = {};
  for (const r of llm) {
    const p = (providers[r.provider_key] ??= { total: 0, errors: 0, latency: 0 });
    p.total++;
    if (r.status !== "success") p.errors++;
    p.latency += Number(r.latency_ms ?? 0);
  }
  const reasons: Record<string, number> = {};
  for (const e of execs)
    if (e.status === "failed" && e.last_error) {
      const k = String(e.last_error).slice(0, 80);
      reasons[k] = (reasons[k] ?? 0) + 1;
    }
  return {
    executions: execs.length,
    succeeded: ok,
    failed,
    queued: execs.filter((e) => ["queued", "retrying"].includes(e.status)).length,
    running: execs.filter((e) => e.status === "running").length,
    blocked: execs.filter((e) => ["paused", "disabled"].includes(e.status)).length,
    successRate: pct(ok, done.length),
    failureRate: pct(failed, done.length),
    avgDurationMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    tokens: llm.reduce((s, r) => s + Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0), 0),
    providers: Object.entries(providers).map(([provider, v]) => ({
      provider,
      requests: v.total,
      errors: v.errors,
      avgLatencyMs: Math.round(v.latency / v.total),
    })),
    topFailures: Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
  };
}

function deploymentState(d: Row, now = Date.now()) {
  if (d.expires_at && new Date(d.expires_at).getTime() < now) return "expired";
  if (d.is_active === false || d.enabled === false) return "disabled";
  const s = String(d.run_state || d.status || "");
  if (["paused", "stopped", "suspended"].includes(s)) return "paused";
  if (s === "testing") return "testing";
  if (s === "provisioning") return "provisioning";
  return d.status === "active" || s === "active" ? "active" : s || "unknown";
}

async function loadKind(kind: (typeof KINDS)[number], hours: number) {
  const { db2Admin, db3Admin, db4Admin } = await import("@/server/db/clients.server");
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data: deps, error } = await db2Admin
    .from("client_automations")
    .select(
      "id,client_id,client_name,company_name,domain_url,status,run_state,is_active,enabled,activated_at,expires_at,last_success_at,last_error,last_error_at,usage_count,config,created_at",
    )
    .or(`automation_type.eq.${kind},product_type.eq.${kind}`)
    .limit(1000);
  if (error) throw new Error(`DB2: ${error.message}`);
  const ids = (deps ?? []).map((d) => d.id);
  const [ex, llm] = await Promise.all([
    db4Admin
      .from("automation_executions")
      .select(
        "id,automation_id,client_id,status,attempt_count,max_attempts,error_class,last_error,trigger_type,queued_at,started_at,finished_at,result",
      )
      .eq("automation_kind", kind)
      .gte("queued_at", since)
      .order("queued_at", { ascending: false })
      .limit(1000),
    ids.length
      ? db3Admin
          .from("llm_requests")
          .select("automation_id,provider_key,status,latency_ms,tokens_in,tokens_out,created_at")
          .in("automation_id", ids)
          .gte("created_at", since)
          .limit(5000)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  if (ex.error) throw new Error(`DB4: ${ex.error.message}`);
  return {
    deps: (deps ?? []) as Row[],
    execs: (ex.data ?? []) as Row[],
    llm: (llm.data ?? []) as Row[],
  };
}

export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(context);
    const out = await Promise.all(
      KINDS.map(async (kind) => {
        const { deps, execs, llm } = await loadKind(kind, 24);
        const states = deps.map((d) => deploymentState(d));
        const s = summarize(execs, llm);
        return {
          kind,
          deployments: deps.length,
          clients: new Set(deps.map((d) => d.client_id)).size,
          activeClients: new Set(
            deps.filter((_, i) => states[i] === "active").map((d) => d.client_id),
          ).size,
          active: states.filter((x) => x === "active").length,
          testing: states.filter((x) => x === "testing").length,
          paused: states.filter((x) => x === "paused").length,
          expired: states.filter((x) => x === "expired").length,
          provisioning: states.filter((x) => x === "provisioning").length,
          setupIssues: deps.filter((d) => d.last_error).length,
          executions24h: s.executions,
          succeeded24h: s.succeeded,
          queued: s.queued,
          failed24h: s.failed,
          recentFailures: s.topFailures.slice(0, 3),
          lastActivity: execs[0]?.queued_at ?? null,
          successRate: s.successRate,
          providerErrors: s.providers.reduce((a, p) => a + p.errors, 0),
          lastSuccess:
            deps
              .map((d) => d.last_success_at)
              .filter(Boolean)
              .sort()
              .at(-1) ?? null,
        };
      }),
    );
    return out;
  });

export const getControlRoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ kind: z.enum(KINDS), range: z.enum(["24h", "7d", "30d", "90d"]).default("7d") })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { deps, execs, llm } = await loadKind(data.kind, RANGE_H[data.range]);
    const { db3Admin } = await import("@/server/db/clients.server");
    const { data: keys } = await db3Admin
      .from("llm_api_keys")
      .select(
        "id,provider_key,label,model,is_active,priority,request_count,error_count,last_error,cooldown_until,last_used_at",
      );
    const lastByAuto: Record<string, string> = {};
    for (const e of execs)
      if (!lastByAuto[e.automation_id]) lastByAuto[e.automation_id] = e.queued_at;
    const states = deps.map((d) => deploymentState(d));
    return {
      kind: data.kind,
      range: data.range,
      counts: {
        total: deps.length,
        active: states.filter((s) => s === "active").length,
        testing: states.filter((s) => s === "testing").length,
        paused: states.filter((s) => s === "paused").length,
        expired: states.filter((s) => s === "expired").length,
        clients: new Set(deps.map((d) => d.client_id)).size,
      },
      stats: summarize(execs, llm),
      deployments: deps.map((d, i) => ({
        id: d.id,
        clientId: d.client_id,
        client: d.company_name || d.client_name || d.client_id,
        domain: d.domain_url,
        state: states[i],
        activatedAt: d.activated_at,
        expiresAt: d.expires_at,
        lastExecution: lastByAuto[d.id] ?? null,
        lastSuccess: d.last_success_at,
        lastError: d.last_error,
        usage: d.usage_count ?? 0,
        config: d.config ?? {},
      })),
      executions: execs.slice(0, 200).map((e) => ({
        id: e.id,
        automationId: e.automation_id,
        clientId: e.client_id,
        status: e.status,
        attempts: `${e.attempt_count}/${e.max_attempts}`,
        trigger: e.trigger_type,
        queuedAt: e.queued_at,
        durationMs:
          e.started_at && e.finished_at
            ? new Date(e.finished_at).getTime() - new Date(e.started_at).getTime()
            : null,
        error: e.last_error ? String(e.last_error).slice(0, 300) : null,
      })),
      keys: (keys ?? []).map((k) => ({
        ...k,
        coolingDown: !!k.cooldown_until && new Date(k.cooldown_until).getTime() > Date.now(),
      })),
      queue: {
        pending: execs.filter((e) => ["queued", "retrying"].includes(e.status)).length,
        running: execs.filter((e) => e.status === "running").length,
        oldestPending:
          execs
            .filter((e) => e.status === "queued")
            .map((e) => e.queued_at)
            .sort()[0] ?? null,
      },
    };
  });

export const setDeploymentState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ automationId: z.string().uuid(), state: z.enum(["active", "testing", "paused"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { db2Admin } = await import("@/server/db/clients.server");
    const now = new Date().toISOString();
    const patch: Row =
      data.state === "paused"
        ? { status: "paused", run_state: "paused", paused_at: now }
        : {
            status: "active",
            run_state: data.state,
            is_active: true,
            enabled: true,
            ...(data.state === "active" ? { activated_at: now } : {}),
          };
    const { data: current, error: currentError } = await db2Admin
      .from("client_automations")
      .select("id,client_id,automation_type,product_type,last_success_at")
      .eq("id", data.automationId)
      .single();
    if (currentError || !current) throw new Error(currentError?.message ?? "Automation not found");
    if (data.state === "active") {
      if (!current.last_success_at) {
        throw new Error("Activation requires at least one successful test execution.");
      }
      const kind = String(current.automation_type || current.product_type || "");
      if (kind === "ai_receptionist" || kind === "messaging_ai") {
        throw new Error(
          "This automation cannot be marked fully active until its outbound channel adapter is implemented and verified.",
        );
      }
    }
    const { data: row, error } = await db2Admin
      .from("client_automations")
      .update(patch as any)
      .eq("id", data.automationId)
      .select("id,client_id,status,run_state")
      .single();
    if (error) throw new Error(error.message);
    const { auditMutation } = await import("@/lib/platform-access.server");
    await auditMutation(
      context.userId,
      `automation.state.${data.state}`,
      "client_automation",
      data.automationId,
      { state: data.state },
      String(row.client_id),
    );
    return row;
  });

export const saveDeploymentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        settings: z
          .record(z.string(), z.union([z.string().max(8000), z.number(), z.boolean()]))
          .optional(),
        pool: poolSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { db2Admin } = await import("@/server/db/clients.server");
    const { data: cur, error: e1 } = await db2Admin
      .from("client_automations")
      .select("config,client_id")
      .eq("id", data.automationId)
      .single();
    if (e1) throw new Error(e1.message);
    const curCfg = (cur.config ?? {}) as Row;
    const config = {
      ...curCfg,
      ...(data.settings ? { settings: { ...(curCfg.settings ?? {}), ...data.settings } } : {}),
      ...(data.pool ? { provider_pool: data.pool } : {}),
    };
    const { error } = await db2Admin
      .from("client_automations")
      .update({ config: config as any })
      .eq("id", data.automationId);
    if (error) throw new Error(error.message);
    const { auditMutation } = await import("@/lib/platform-access.server");
    await auditMutation(
      context.userId,
      "automation.config.updated",
      "client_automation",
      data.automationId,
      { keys: Object.keys(data.settings ?? {}), pool: data.pool?.strategy ?? null },
      String(cur.client_id),
    );
    return { ok: true, config };
  });

export const executionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ executionId: z.string().uuid(), action: z.enum(["cancel", "retry"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { db4Admin } = await import("@/server/db/clients.server");
    const { data: e, error } = await db4Admin
      .from("automation_executions")
      .select("id,status,attempt_count,max_attempts,client_id")
      .eq("id", data.executionId)
      .single();
    if (error) throw new Error(error.message);
    let patch: Row;
    if (data.action === "cancel") {
      if (["succeeded", "failed", "cancelled"].includes(e.status))
        throw new Error(`Cannot cancel a ${e.status} execution`);
      patch =
        e.status === "running"
          ? { cancel_requested: true }
          : { status: "cancelled", cancel_requested: true, finished_at: new Date().toISOString() };
    } else {
      if (!["failed", "cancelled", "paused", "disabled"].includes(e.status))
        throw new Error(`Only failed, cancelled or blocked executions can be retried`);
      patch = {
        status: "queued",
        cancel_requested: false,
        next_attempt_at: new Date().toISOString(),
        finished_at: null,
        max_attempts: Math.min(20, Math.max(e.max_attempts, e.attempt_count + 1)),
      };
    }
    const { error: e2 } = await db4Admin
      .from("automation_executions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", e.id);
    if (e2) throw new Error(e2.message);
    const { auditMutation } = await import("@/lib/platform-access.server");
    await auditMutation(
      context.userId,
      `automation.execution.${data.action}`,
      "automation_execution",
      e.id,
      {},
      String(e.client_id),
    );
    return { ok: true };
  });

export const queueTestExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        input: z.record(z.string(), z.string().max(4000)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { db2Admin } = await import("@/server/db/clients.server");
    const { data: a, error } = await db2Admin
      .from("client_automations")
      .select("id,client_id,automation_type,product_type")
      .eq("id", data.automationId)
      .single();
    if (error) throw new Error(error.message);
    const kind = String(a.automation_type || a.product_type);
    if (!(KINDS as readonly string[]).includes(kind))
      throw new Error("Not one of the four automations");
    const { enqueueExecution } = await import("@/lib/automation-engine.server");
    const exec: any = await enqueueExecution({
      automationId: a.id,
      clientId: a.client_id,
      kind: kind as any,
      idempotencyKey: `admin-test:${crypto.randomUUID()}`,
      input: { ...data.input, test: true },
      triggerType: "admin_test",
      maxAttempts: 2,
    });
    return { executionId: exec?.id ?? null };
  });

export const testProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { db3Admin } = await import("@/server/db/clients.server");
    const { data: k, error } = await db3Admin
      .from("llm_api_keys")
      .select("provider_key,label")
      .eq("id", data.keyId)
      .single();
    if (error) throw new Error(error.message);
    const { routeChat } = await import("@/lib/llm-router.server");
    const t0 = Date.now();
    const r = await routeChat([{ role: "user", content: "Reply with the single word OK." }], {
      provider: k.provider_key,
      keyLabel: k.label,
      maxTokens: 10,
    });
    return { ok: !!r, latencyMs: Date.now() - t0, model: r?.model ?? null }; // never returns key material
  });
