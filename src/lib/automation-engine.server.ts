// Automation execution worker for the four System B automations.
// Queue/lease/retry state lives in DB4 (automation_executions + RPCs); runtime gating comes from DB2
// (client_automations). Each automation kind has its own handler — business logic is NOT shared.
// The Web AI Assistant (src/assistant/*) never runs through this engine.
import { evaluateRuntime } from "@/lib/runtime-gate";
import { parsePool } from "@/lib/provider-pool";
import * as cfg from "@/lib/automation-config";
const settingsOf = (ctx: { automation: Record<string, unknown> }) =>
  cfg.settingsFromConfig(ctx.automation.config);
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

/** Reads the REAL DB2 runtime state. Returns a reason string when new work must not start. */
export async function runtimeBlockReason(
  automationId: string,
  opts: { isTest?: boolean } = {},
): Promise<{ reason: string | null; automation: JsonRecord | null }> {
  const { data, error } = await db2Admin
    .from("client_automations")
    .select(
      "id,client_id,automation_type,product_type,status,run_state,enabled,is_active,expires_at,config,metadata",
    )
    .eq("id", automationId)
    .maybeSingle();
  if (error) throw new Error(`DB2 runtime lookup failed: ${error.message}`);
  return { reason: evaluateRuntime(data, opts), automation: data };
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
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (contact) {
    const { data: existing, error: existingError } = await db4Admin
      .from("conversations")
      .select("id,metadata")
      .eq("automation_id", ctx.exec.automation_id)
      .eq("customer_phone_or_id", contact)
      .eq("channel", channel)
      .eq("status", "active")
      .gte("last_message_at", recentCutoff)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(`conversation lookup: ${existingError.message}`);
    if (existing) {
      const metadata = asRecord(existing.metadata);
      metadata.last_execution_id = ctx.exec.id;
      const { error: touchError } = await db4Admin
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          metadata: metadata as Json,
        })
        .eq("id", existing.id);
      if (touchError) throw new Error(`conversation update: ${touchError.message}`);
      return String(existing.id);
    }
  }
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

async function recentConversationHistory(conversationId: string) {
  const { data, error } = await db4Admin
    .from("messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(`message history: ${error.message}`);
  return (data ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));
}

async function addMessageAndReturnId(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  externalId?: string | null,
) {
  const { data, error } = await db4Admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      external_message_id: externalId ?? null,
      sender_type: role === "user" ? "contact" : "assistant",
      message_type: "text",
    })
    .select("id")
    .single();
  if (error) throw new Error(`message insert: ${error.message}`);
  return String(data.id);
}

async function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  externalId?: string | null,
) {
  await addMessageAndReturnId(conversationId, role, content, externalId);
}

async function aiReply(
  ctx: Ctx,
  system: string,
  user: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
) {
  const { routeChat } = await import("@/lib/llm-router.server");
  const r = await routeChat(
    [{ role: "system", content: system }, ...history, { role: "user", content: user }],
    {
      automationId: ctx.exec.automation_id,
      clientId: ctx.exec.client_id,
      maxTokens: 400,
      pool: parsePool(asRecord(ctx.automation.config).provider_pool),
    },
  );
  return r?.reply ?? null; // null = no provider available; caller decides (never fake a reply)
}

// Calendar intent is deliberately structured before any booking action: the model may identify intent and dates,
// but only Google Calendar availability can authorize a slot and only the calendar API creates the event.
async function handleReceptionistCalendar(
  ctx: Ctx,
  conversationId: string,
  st: cfg.Settings,
  userText: string,
  contact: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const { routeChat } = await import("@/lib/llm-router.server");
  const now = new Date().toISOString();
  const result = await routeChat(
    [
      {
        role: "system",
        content:
          `You are a strict appointment-intent parser. Current UTC time is ${now}. ` +
          `Return ONLY JSON with keys action, start, end, attendee_name, attendee_email, summary. ` +
          `action must be one of none, availability, book. Use ISO-8601 timestamps with an explicit offset. ` +
          `Choose availability when the user asks whether a specific time is free; choose book when they explicitly ask to book, schedule, reserve or confirm an appointment. ` +
          `Use none when no concrete appointment time can be inferred. Never invent a time. ` +
          `Default duration is 30 minutes unless the appointment rules clearly specify another duration. ` +
          `Appointment rules: ${String(st.appointment_rules ?? "")}`,
      },
      ...history,
      { role: "user", content: userText },
    ],
    {
      automationId: ctx.exec.automation_id,
      clientId: ctx.exec.client_id,
      maxTokens: 220,
      jsonMode: true,
      pool: parsePool(asRecord(ctx.automation.config).provider_pool),
    },
  );
  if (!result?.reply) return null;
  let intent: Record<string, unknown>;
  try {
    intent = JSON.parse(result.reply) as Record<string, unknown>;
  } catch {
    return null;
  }
  const action = String(intent.action ?? "none");
  if (!["availability", "book"].includes(action)) return null;
  const start = String(intent.start ?? "");
  const end = String(intent.end ?? "");
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate)
    return null;
  const { findCalendarAvailability, createCalendarEvent } =
    await import("@/lib/integration-delivery.server");
  const availability = await findCalendarAvailability({
    automationId: ctx.exec.automation_id,
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
  });
  const calendars = asRecord(availability.calendars);
  const primary = asRecord(calendars.primary);
  const busy = Array.isArray(primary.busy)
    ? primary.busy
    : Object.values(calendars).flatMap((c) =>
        Array.isArray(asRecord(c).busy) ? (asRecord(c).busy as unknown[]) : [],
      );
  if (busy.length) {
    const reply = `That time is already booked. Please give me another date or time and I’ll check it.`;
    const messageId = await addMessageAndReturnId(conversationId, "assistant", reply);
    return { reply, message_id: messageId, calendar: { action, available: false } };
  }
  if (action === "availability") {
    const reply = `Yes, that time is available. If you’d like, I can book it for you.`;
    const messageId = await addMessageAndReturnId(conversationId, "assistant", reply);
    return {
      reply,
      message_id: messageId,
      calendar: {
        action,
        available: true,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  }
  const email = String(intent.attendee_email ?? "").trim();
  const name = String(intent.attendee_name ?? "").trim();
  const summary = String(intent.summary ?? "Appointment").trim() || "Appointment";
  const event = await createCalendarEvent({
    automationId: ctx.exec.automation_id,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    summary,
    description: `Booked by AntheticPlus automation for ${name || contact}.`,
    ...(email ? { attendeeEmail: email } : {}),
  });
  const { error } = await db4Admin.from("appointments").insert({
    client_id: ctx.exec.client_id,
    automation_id: ctx.exec.automation_id,
    conversation_id: conversationId,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    timezone: "UTC",
    status: "booked",
    visitor_name: name,
    visitor_email: email,
    visitor_phone: contact,
    notes: String(st.appointment_rules ?? ""),
    external_ref: event.id || null,
  });
  if (error) throw new Error(`appointment record: ${error.message}`);
  const reply = `You’re booked for ${startDate.toISOString()}${event.htmlLink ? `. I’ve added it to the calendar.` : "."}`;
  const messageId = await addMessageAndReturnId(conversationId, "assistant", reply);
  return {
    reply,
    message_id: messageId,
    calendar: {
      action,
      available: true,
      booked: true,
      event_id: event.id,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  };
}

// ---- Voice & SMS Receptionist (ai_receptionist) ----
export async function runReceptionistTurn(ctx: Ctx, input: JsonRecord) {
  const channel = input.channel === "voice" ? "phone_call" : "sms";
  if (!input.from || !input.body)
    throw new NonRetryableError("receptionist input requires from and body");
  const conv = await openConversation(ctx, channel, String(input.from), "Inbound " + channel);
  await addMessage(conv, "user", String(input.body), optionalText(input.message_id));
  const st = settingsOf(ctx);
  if (cfg.matchesEscalation(String(input.body), st.escalation_rules)) {
    const assignment = await assignRoundRobin(ctx, "conversation", conv);
    return {
      conversation_id: conv,
      escalated: true,
      reason: "escalation_rule",
      reply: null,
      assignment_id: (assignment as { id?: string } | null)?.id ?? null,
    };
  }
  const history = await recentConversationHistory(conv);
  const calendarResult = await handleReceptionistCalendar(
    ctx,
    conv,
    st,
    String(input.body),
    String(input.from),
    history,
  );
  if (calendarResult) return { ...calendarResult, conversation_id: conv, escalated: false };
  const reply = await aiReply(ctx, cfg.receptionistPrompt(st), String(input.body), history);
  if (!reply) throw new Error("no AI provider available");
  const messageId = await addMessageAndReturnId(conv, "assistant", reply);
  const assignment = await assignRoundRobin(ctx, "conversation", conv);
  return {
    conversation_id: conv,
    escalated: false,
    reply,
    message_id: messageId,
    assignment_id: (assignment as { id?: string } | null)?.id ?? null,
  };
}

async function handleReceptionist(ctx: Ctx) {
  const result = await runReceptionistTurn(ctx, asRecord(ctx.exec.input));
  if (result.reply && String(ctx.exec.input.channel ?? "sms") !== "voice") {
    const { sendTwilioMessage, markMessageDelivered } =
      await import("@/lib/integration-delivery.server");
    const sent = await sendTwilioMessage({
      automationId: ctx.exec.automation_id,
      to: String(ctx.exec.input.from),
      body: result.reply,
    });
    if (result.message_id) await markMessageDelivered(result.message_id, sent);
    return {
      ...result,
      delivered: true,
      delivery_status: sent.status,
      delivery_provider: sent.provider,
      external_message_id: sent.externalId,
    };
  }
  return {
    ...result,
    delivered: result.escalated ? false : null,
    delivery_status: result.escalated ? "escalated" : "voice_turn",
  };
}

// ---- Lead Capture & Qualifier (lead_capture) ----
async function handleLeadCapture(ctx: Ctx) {
  const i = asRecord(ctx.exec.input);
  const st = settingsOf(ctx);
  const missing = cfg.missingLeadFields(i, st);
  if (missing.length)
    throw new NonRetryableError(`lead missing required fields: ${missing.join(", ")}`);
  const scored = cfg.scoreLead(i, st);
  const escalate = cfg.matchesEscalation(String(i.message ?? ""), st.escalation_rules);
  const { score } = scored;
  const tier = escalate ? "hot" : scored.tier;
  const qualified = tier === "hot";
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
      status: qualified ? "qualified" : "new",
      metadata: {
        execution_id: ctx.exec.id,
        company: asJson(i.company ?? null),
        tier,
        routing: String(st.routing ?? ""),
        notify_email: String(st.notify_email ?? ""),
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(`lead insert: ${error.message}`);
  const assignment = qualified ? await assignRoundRobin(ctx, "lead", lead.id) : null;
  const followUp = String(st.follow_up ?? "").trim();
  const notifyEmail = String(st.notify_email ?? "").trim();
  const webhookUrl = String(st.webhook_url ?? "").trim();
  const delivery: Record<string, unknown> = {};
  if (qualified && followUp && i.phone) {
    try {
      const { sendTwilioMessage } = await import("@/lib/integration-delivery.server");
      const sent = await sendTwilioMessage({
        automationId: ctx.exec.automation_id,
        to: String(i.phone),
        body: followUp,
      });
      delivery.follow_up = sent;
    } catch (e) {
      delivery.follow_up_error = e instanceof Error ? e.message : String(e);
    }
  }
  if (qualified && notifyEmail) {
    try {
      const { sendResendEmail } = await import("@/lib/integration-delivery.server");
      delivery.notification = await sendResendEmail({
        to: notifyEmail,
        subject: `New ${tier} lead: ${String(i.name ?? i.email ?? "Lead")}`,
        body: `A ${tier} lead was captured.\n\nName: ${String(i.name ?? "")}\nEmail: ${String(i.email ?? "")}\nPhone: ${String(i.phone ?? "")}\nScore: ${score}\nSource: ${String(i.source ?? "")}\nIntent: ${String(i.intent ?? "")}\nSummary: ${String(i.message ?? "")}`,
      });
    } catch (e) {
      delivery.notification_error = e instanceof Error ? e.message : String(e);
    }
  }
  if (webhookUrl) {
    try {
      const { postLeadWebhook } = await import("@/lib/integration-delivery.server");
      delivery.webhook = await postLeadWebhook(webhookUrl, {
        event: "lead.created",
        lead_id: lead.id,
        client_id: ctx.exec.client_id,
        automation_id: ctx.exec.automation_id,
        name: i.name ?? null,
        email: i.email ?? null,
        phone: i.phone ?? null,
        score,
        tier,
        qualified,
      });
    } catch (e) {
      delivery.webhook_error = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    lead_id: lead.id,
    score,
    tier,
    escalated: escalate,
    qualified,
    assignment_id: (assignment as { id?: string } | null)?.id ?? null,
    delivery,
  };
}

// ---- Knowledge Base Support (kb_support) — knowledge in DB3, escalations in DB4 ----
async function handleKbSupport(ctx: Ctx) {
  const i = asRecord(ctx.exec.input);
  if (!i.question) throw new NonRetryableError("kb_support input requires question");
  const { retrieveKnowledge } = await import("@/lib/rag.server");
  const st = settingsOf(ctx);
  const minSim = cfg.kbMinSimilarity(st);
  const hits = (
    await retrieveKnowledge(ctx.exec.automation_id, String(i.question), 5).catch(() => [])
  ).filter((h: { similarity?: unknown }) => !minSim || Number(h.similarity ?? 1) >= minSim);
  const conv = await openConversation(
    ctx,
    "web_chat",
    i.contact ? String(i.contact) : null,
    "Support question",
  );
  await addMessage(conv, "user", String(i.question));
  const ruleEscalation = cfg.matchesEscalation(String(i.question), st.escalation_rules);
  if (ruleEscalation || !hits?.length) {
    const { data: esc, error } = await db4Admin
      .from("ticket_escalations")
      .insert({
        client_id: ctx.exec.client_id,
        automation_id: ctx.exec.automation_id,
        conversation_id: conv,
        reason: ruleEscalation ? "escalation_rule" : "no_knowledge_match",
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
      handoff_message: String(st.handoff_message ?? ""),
      assignment_id: (assignment as { id?: string } | null)?.id ?? null,
    };
  }
  const context = hits
    .map((h, n) => `[${n + 1}] ${String(h.content ?? "")}`)
    .join("\n")
    .slice(0, 6000);
  const history = await recentConversationHistory(conv);
  const reply = await aiReply(ctx, cfg.kbPrompt(st, context), String(i.question), history);
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
  const st = settingsOf(ctx);
  if (!cfg.dmChannelAllowed(platform, st))
    throw new NonRetryableError(`channel ${platform} is not enabled for this deployment`);
  const channelCandidates = ["whatsapp", "messenger", "instagram"] as const;
  const channel = channelCandidates.includes(platform as (typeof channelCandidates)[number])
    ? platform
    : "web_chat";
  const limit = cfg.dmRateLimit(st);
  if (limit) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db4Admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", ctx.exec.automation_id)
      .eq("customer_phone_or_id", String(i.sender_id))
      .gte("created_at", since);
    if ((count ?? 0) >= limit)
      throw new NonRetryableError(`rate limit: ${limit} replies/hour reached for this contact`);
  }
  const conv = await openConversation(ctx, channel, String(i.sender_id), "Direct message");
  await addMessage(conv, "user", String(i.text), optionalText(i.message_id));
  if (cfg.matchesEscalation(String(i.text), st.handoff_rules)) {
    const assignment = await assignRoundRobin(ctx, "conversation", conv);
    return {
      conversation_id: conv,
      escalated: true,
      reason: "handoff_rule",
      assignment_id: (assignment as { id?: string } | null)?.id ?? null,
    };
  }
  const history = await recentConversationHistory(conv);
  const reply = await aiReply(ctx, cfg.dmPrompt(st), String(i.text), history);
  if (!reply) throw new Error("no AI provider available");
  const messageId = await addMessageAndReturnId(conv, "assistant", reply);
  const { sendMetaMessage, markMessageDelivered } =
    await import("@/lib/integration-delivery.server");
  const sent = await sendMetaMessage({
    automationId: ctx.exec.automation_id,
    platform,
    recipientId: String(i.sender_id),
    body: reply,
  });
  await markMessageDelivered(messageId, sent);
  return {
    conversation_id: conv,
    reply_stored: true,
    delivered: true,
    delivery_status: sent.status,
    delivery_provider: sent.provider,
    external_message_id: sent.externalId,
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
    const gate = await runtimeBlockReason(exec.automation_id, {
      isTest: asRecord(exec.input).test === true,
    }).catch((e) => ({
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
      // Record which saved configuration produced this result (audit/debug of config-driven behaviour).
      const configVersion = cfg.configVersion(settingsOf({ automation: gate.automation! }));
      await finish(exec.id, workerId, "succeeded", null, {
        ...result,
        config_version: configVersion,
      });
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
