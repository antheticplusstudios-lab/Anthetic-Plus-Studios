// Automation execution worker for the four System B automations.
// Queue/lease/retry state lives in DB4 (automation_executions + RPCs); runtime gating comes from DB2
// (client_automations). Each automation kind has its own handler — business logic is NOT shared.
// The Web AI Assistant (src/assistant/*) never runs through this engine.
import { db2Admin, db4Admin } from "@/server/db/clients.server";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

export const AUTOMATION_KINDS = [
  "ai_receptionist",
  "lead_capture",
  "kb_support",
  "messaging_ai",
] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

/** Errors a handler throws to classify the failure. Anything else is treated as retryable. */
export class NonRetryableError extends Error {}

type JsonRecord = Record<string, unknown>;
type Execution = {
  id: string;
  automation_id: string;
  client_id: string;
  automation_kind: AutomationKind;
  input: JsonRecord;
  timeout_seconds: number;
  attempt_count: number;
  max_attempts: number;
};
type Ctx = { exec: Execution; automation: JsonRecord };
function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

const BLOCKED_STATES = new Set([
  "paused",
  "stopped",
  "disabled",
  "suspended",
  "expired",
  "decommissioned",
  "killed",
]);

/** Reads the REAL DB2 runtime state. Returns a reason string when new work must not start. */
export async function runtimeBlockReason(
  automationId: string,
): Promise<{ reason: string | null; automation: JsonRecord | null }> {
  const { data, error } = await db2Admin
    .from("client_automations")
    .select(
      "id,client_id,automation_type,product_type,status,run_state,enabled,is_active,expires_at,config,metadata",
    )
    .eq("id", automationId)
    .maybeSingle();
  if (error) throw new Error(`DB2 runtime lookup failed: ${error.message}`);
  if (!data) return { reason: "automation_not_found", automation: null };
  if (data.enabled === false || data.is_active === false)
    return { reason: "disabled", automation: data };
  if (data.status && BLOCKED_STATES.has(String(data.status)))
    return { reason: String(data.status), automation: data };
  if (data.run_state && BLOCKED_STATES.has(String(data.run_state)))
    return { reason: String(data.run_state), automation: data };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now())
    return { reason: "expired", automation: data };
  return { reason: null, automation: data };
}

async function assignRoundRobin(ctx: Ctx, subjectType: string, subjectId: string) {
  const { data: team } = await db4Admin
    .from("round_robin_teams")
    .select("id,assignment_strategy")
    .eq("client_id", ctx.exec.client_id)
    .eq("automation_id", ctx.exec.automation_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!team) return null;
  const { data, error } = await db4Admin.rpc("assign_round_robin", {
    p_team_id: team.id,
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_strategy: team.assignment_strategy ?? "round_robin",
    p_manual_member_id: null,
  });
  if (error) throw new Error(`round-robin: ${error.message}`);
  return data;
}

function asJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(asJson);
  if (typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asJson(item)]));
  return null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function openConversation(
  ctx: Ctx,
  channel: string,
  contact: string | null,
  subject?: string,
) {
  const { data, error } = await db4Admin
    .from("conversations")
    .insert({
      client_id: ctx.exec.client_id,
      automation_id: ctx.exec.automation_id,
      channel,
      customer_phone_or_id: contact,
      origin: "automation_engine",
      status: "active",
      subject: subject ?? "Automation conversation",
      last_message_at: new Date().toISOString(),
      metadata: { execution_id: ctx.exec.id },
    })
    .select("id")
    .single();
  if (error) throw new Error(`conversation insert: ${error.message}`);
  return data.id as string;
}

async function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  externalId?: string | null,
) {
  const { error } = await db4Admin.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    external_message_id: externalId ?? null,
    sender_type: role === "user" ? "contact" : "assistant",
    message_type: "text",
  });
  if (error) throw new Error(`message insert: ${error.message}`);
}

async function aiReply(ctx: Ctx, system: string, user: string) {
  const { routeChat } = await import("@/lib/llm-router.server");
  const r = await routeChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { automationId: ctx.exec.automation_id, clientId: ctx.exec.client_id, maxTokens: 400 },
  );
  return r?.reply ?? null; // null = no provider available; caller decides (never fake a reply)
}

// ---- Voice & SMS Receptionist (ai_receptionist) ----
async function handleReceptionist(ctx: Ctx) {
  const i = asRecord(ctx.exec.input);
  const channel = i.channel === "voice" ? "phone_call" : "sms";
  if (!i.from || !i.body) throw new NonRetryableError("receptionist input requires from and body");
  const conv = await openConversation(ctx, channel, String(i.from), "Inbound " + channel);
  await addMessage(conv, "user", String(i.body), optionalText(i.message_id));
  const prompt = String(
    asRecord(ctx.automation.config).system_prompt ??
      "You are a polite business receptionist. Answer briefly, collect name and reason for contact.",
  );
  const reply = await aiReply(ctx, prompt, String(i.body));
  if (reply) await addMessage(conv, "assistant", reply);
  const assignment = await assignRoundRobin(ctx, "conversation", conv);
  return {
    conversation_id: conv,
    replied: Boolean(reply),
    assignment_id: (assignment as { id?: string } | null)?.id ?? null,
    reply_pending_provider: !reply,
  };
}

// ---- Lead Capture & Qualifier (lead_capture) ----
function scoreLead(i: JsonRecord) {
  let s = 0;
  if (i.email) s += 25;
  if (i.phone) s += 25;
  if (i.company) s += 15;
  if (/budget|price|quote|buy|demo|urgent/i.test(String(i.message ?? ""))) s += 25;
  if (String(i.message ?? "").length > 80) s += 10;
  return Math.min(100, s);
}
async function handleLeadCapture(ctx: Ctx) {
  const i = asRecord(ctx.exec.input);
  if (!i.email && !i.phone) throw new NonRetryableError("lead requires email or phone");
  const score = scoreLead(i);
  const { data: lead, error } = await db4Admin
    .from("leads")
    .insert({
      client_id: ctx.exec.client_id,
      automation_id: ctx.exec.automation_id,
      name: String(i.name ?? ""),
      email: String(i.email ?? ""),
      phone: String(i.phone ?? ""),
      intent: String(i.intent ?? ""),
      summary: String(i.message ?? ""),
      source: String(i.source ?? "automation_engine"),
      lead_score: score,
      status: score >= 60 ? "qualified" : "new",
      metadata: { execution_id: ctx.exec.id, company: asJson(i.company ?? null) },
    })
    .select("id")
    .single();
  if (error) throw new Error(`lead insert: ${error.message}`);
  const assignment = score >= 60 ? await assignRoundRobin(ctx, "lead", lead.id) : null;
  return {
    lead_id: lead.id,
    score,
    qualified: score >= 60,
    assignment_id: (assignment as { id?: string } | null)?.id ?? null,
  };
}

// ---- Knowledge Base Support (kb_support) — knowledge in DB3, escalations in DB4 ----
async function handleKbSupport(ctx: Ctx) {
  const i = asRecord(ctx.exec.input);
  if (!i.question) throw new NonRetryableError("kb_support input requires question");
  const { retrieveKnowledge } = await import("@/lib/rag.server");
  const hits = await retrieveKnowledge(ctx.exec.automation_id, String(i.question), 5).catch(
    () => [],
  );
  const conv = await openConversation(
    ctx,
    "web_chat",
    i.contact ? String(i.contact) : null,
    "Support question",
  );
  await addMessage(conv, "user", String(i.question));
  if (!hits?.length) {
    const { data: esc, error } = await db4Admin
      .from("ticket_escalations")
      .insert({
        client_id: ctx.exec.client_id,
        automation_id: ctx.exec.automation_id,
        conversation_id: conv,
        reason: "no_knowledge_match",
        sentiment: 0,
        status: "open",
        visitor_contact: String(i.contact ?? "unknown"),
        transcript: { question: String(i.question) },
      })
      .select("id")
      .single();
    if (error) throw new Error(`escalation insert: ${error.message}`);
    const assignment = await assignRoundRobin(ctx, "ticket", esc.id);
    return {
      conversation_id: conv,
      escalated: true,
      ticket_id: esc.id,
      assignment_id: (assignment as { id?: string } | null)?.id ?? null,
    };
  }
  const context = hits
    .map((h, n) => `[${n + 1}] ${String(h.content ?? "")}`)
    .join("\n")
    .slice(0, 6000);
  const reply = await aiReply(
    ctx,
    "Answer ONLY from the provided knowledge. If not covered, say you will escalate.\n" + context,
    String(i.question),
  );
  if (!reply) throw new Error("no AI provider available"); // retryable
  await addMessage(conv, "assistant", reply);
  return { conversation_id: conv, escalated: false, sources: hits.length };
}

// ---- Social DM Assistant (messaging_ai) ----
async function handleSocialDm(ctx: Ctx) {
  const i = asRecord(ctx.exec.input);
  if (!i.platform || !i.sender_id || !i.text)
    throw new NonRetryableError("DM input requires platform, sender_id, text");
  const platform = String(i.platform).toLowerCase();
  const channelCandidates = ["whatsapp", "messenger", "instagram", "telegram", "sms"] as const;
  const channel = channelCandidates.includes(platform as (typeof channelCandidates)[number])
    ? platform
    : "web_chat";
  const conv = await openConversation(ctx, channel, String(i.sender_id), "Direct message");
  await addMessage(conv, "user", String(i.text), optionalText(i.message_id));
  const reply = await aiReply(
    ctx,
    String(
      asRecord(ctx.automation.config).dm_prompt ??
        "You reply to social media DMs for a business: friendly, short, no prices unless known.",
    ),
    String(i.text),
  );
  if (!reply) throw new Error("no AI provider available");
  await addMessage(conv, "assistant", reply);
  // Outbound delivery to the social platform requires the client's integration credentials (DB2 integration_connections).
  const { data: integ } = await db2Admin
    .from("integration_connections")
    .select("id,status")
    .eq("automation_id", ctx.exec.automation_id)
    .eq("provider", String(i.platform).toLowerCase())
    .maybeSingle();
  return {
    conversation_id: conv,
    reply_stored: true,
    delivered: false,
    delivery_note: integ
      ? "integration found; platform send adapter not yet implemented"
      : "no integration connected",
  };
}

const HANDLERS: Record<AutomationKind, (c: Ctx) => Promise<Record<string, unknown>>> = {
  ai_receptionist: handleReceptionist,
  lead_capture: handleLeadCapture,
  kb_support: handleKbSupport,
  messaging_ai: handleSocialDm,
};

function withTimeout<T>(p: Promise<T>, seconds: number) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(Object.assign(new Error(`timed out after ${seconds}s`), { timeout: true })),
      seconds * 1000,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function finish(
  id: string,
  worker: string,
  outcome: string,
  error: string | null,
  result: unknown,
) {
  const { error: e } = await db4Admin.rpc("finish_automation_execution", {
    p_execution_id: id,
    p_worker_id: worker,
    p_outcome: outcome,
    p_error: error,
    p_result: asJson(result),
  });
  if (e) console.error("finish_automation_execution failed", id, e.message);
}

/** Claims a bounded batch and runs it. Safe to run concurrently: claiming uses FOR UPDATE SKIP LOCKED leases. */
export async function runAutomationWorker(opts: { workerId?: string; limit?: number } = {}) {
  const workerId = opts.workerId ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
  const { data: claimed, error } = await db4Admin.rpc("claim_automation_executions", {
    p_worker_id: workerId,
    p_limit: Math.min(opts.limit ?? 10, 25),
    p_lease_seconds: 300,
  });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const claimedExecutions = z
    .array(
      z.object({
        id: z.string().uuid(),
        automation_id: z.string().uuid(),
        client_id: z.string().uuid(),
        automation_kind: z.enum(AUTOMATION_KINDS),
        input: z.record(z.string(), z.unknown()),
        timeout_seconds: z.number().int().positive(),
        attempt_count: z.number().int().nonnegative(),
        max_attempts: z.number().int().positive(),
      }),
    )
    .parse(claimed ?? []);
  const summary = {
    workerId,
    claimed: claimedExecutions.length,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    blocked: 0,
    cancelled: 0,
  };
  for (const exec of claimedExecutions) {
    const gate = await runtimeBlockReason(exec.automation_id).catch((e) => ({
      reason: null as string | null,
      automation: null,
      err: e as Error,
    }));
    if ("err" in gate) {
      await finish(exec.id, workerId, "retryable", gate.err.message, null);
      summary.retrying++;
      continue;
    }
    if (gate.reason) {
      // DB2 says do not run. Park it without consuming the attempt; resume re-queues it.
      const status = gate.reason === "paused" ? "paused" : "disabled";
      await db4Admin
        .from("automation_executions")
        .update({
          status,
          last_error: `blocked by DB2 runtime state: ${gate.reason}`,
          locked_by: null,
          locked_until: null,
          attempt_count: Math.max(0, exec.attempt_count - 1),
          updated_at: new Date().toISOString(),
        })
        .eq("id", exec.id)
        .eq("locked_by", workerId);
      summary.blocked++;
      continue;
    }
    const kind = exec.automation_kind;
    const handler = HANDLERS[kind];
    const declared = String(
      gate.automation?.automation_type ?? gate.automation?.product_type ?? "",
    );
    if (!handler || (declared && declared !== kind)) {
      await finish(
        exec.id,
        workerId,
        "non_retryable",
        `kind ${kind} does not match automation type ${declared}`,
        null,
      );
      summary.failed++;
      continue;
    }
    try {
      const result = await withTimeout(
        handler({ exec, automation: gate.automation! }),
        exec.timeout_seconds || 120,
      );
      await finish(exec.id, workerId, "succeeded", null, result);
      await db2Admin
        .from("client_automations")
        .update({
          last_success_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", exec.automation_id);
      summary.succeeded++;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const timeout = typeof e === "object" && e !== null && "timeout" in e && Boolean(e.timeout);
      const outcome =
        e instanceof NonRetryableError ? "non_retryable" : timeout ? "timeout" : "retryable";
      await finish(exec.id, workerId, outcome, message, null);
      await db2Admin
        .from("client_automations")
        .update({ last_error_at: new Date().toISOString(), last_error: message.slice(0, 500) })
        .eq("id", exec.automation_id);
      if (outcome === "non_retryable" || exec.attempt_count >= exec.max_attempts) summary.failed++;
      else summary.retrying++;
    }
  }
  return summary;
}

export async function enqueueExecution(args: {
  automationId: string;
  clientId: string;
  kind: AutomationKind;
  idempotencyKey: string;
  input: unknown;
  triggerType: string;
  maxAttempts?: number;
}) {
  const { data, error } = await db4Admin.rpc("enqueue_automation_execution", {
    p_automation_id: args.automationId,
    p_client_id: args.clientId,
    p_kind: args.kind,
    p_idempotency_key: args.idempotencyKey,
    p_input: args.input as Json,
    p_trigger_type: args.triggerType,
    p_max_attempts: args.maxAttempts ?? 5,
  });
  if (error) throw new Error(error.message);
  // The RPC is declared RETURNS TABLE(execution_id uuid, created boolean), so PostgREST returns an array of rows.
  const row = (Array.isArray(data) ? data[0] : data) as
    { execution_id?: string; created?: boolean } | null | undefined;
  return { id: row?.execution_id ?? null, created: row?.created ?? false };
}
