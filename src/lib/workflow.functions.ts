import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { db4Admin } from "@/server/db/clients.server";
import { encryptSecret } from "@/server/security/envelope.server";

const Step = z.object({ stepOrder: z.number().int().min(0), stepType: z.string().min(1).max(80), config: z.record(z.string(), z.unknown()).default({}), condition: z.record(z.string(), z.unknown()).default({}), retryPolicy: z.record(z.string(), z.unknown()).default({}), timeoutSeconds: z.number().int().min(1).max(86400).default(300) });

export const adminListWorkflows = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  let q = db4Admin.from("workflow_definitions").select("*").order("updated_at", { ascending: false });
  if (!context.tenant.isSuperAdmin) q = q.eq("client_id", context.tenant.clientId);
  const { data: workflows, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (workflows ?? []).map((w: any) => String(w.id));
  const steps = ids.length ? await db4Admin.from("workflow_steps").select("*").in("workflow_id", ids).order("step_order", { ascending: true }) : { data: [], error: null };
  const runs = ids.length ? await db4Admin.from("workflow_runs").select("*").in("workflow_id", ids).order("queued_at", { ascending: false }).limit(250) : { data: [], error: null };
  if (steps.error) throw new Error(steps.error.message);
  if (runs.error) throw new Error(runs.error.message);
  return { clientId: context.tenant.clientId, workflows: workflows ?? [], steps: steps.data ?? [], runs: runs.data ?? [] };
});

export const adminSaveWorkflow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ id: z.string().uuid().nullable().default(null), clientId: z.string().uuid(), automationId: z.string().uuid().nullable().default(null), name: z.string().min(1).max(160), description: z.string().max(1000).default(""), status: z.enum(["draft","active","paused","archived"]), triggerType: z.string().min(1).max(80), triggerConfig: z.record(z.string(), z.unknown()).default({}), steps: z.array(Step).max(100).default([]) }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  if (!context.tenant.isSuperAdmin && data.clientId !== context.tenant.clientId) throw new Error("Outside your client scope");
  const payload = { client_id: data.clientId, automation_id: data.automationId, name: data.name.trim(), description: data.description, status: data.status, version: 1, trigger_type: data.triggerType, trigger_config: data.triggerConfig };
  const result = data.id ? await db4Admin.from("workflow_definitions").update(payload).eq("id", data.id).select("id").single() : await db4Admin.from("workflow_definitions").insert(payload).select("id").single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "Could not save workflow");
  const workflowId = String(result.data.id);
  await db4Admin.from("workflow_steps").delete().eq("workflow_id", workflowId);
  if (data.steps.length) {
    const inserted = await db4Admin.from("workflow_steps").insert(data.steps.map((s) => ({ workflow_id: workflowId, step_order: s.stepOrder, step_type: s.stepType, config: s.config, condition: s.condition, retry_policy: s.retryPolicy, timeout_seconds: s.timeoutSeconds })));
    if (inserted.error) throw new Error(inserted.error.message);
  }
  await auditMutation(context, { action: data.id ? "workflow.updated" : "workflow.created", targetType: "workflow", targetId: workflowId, clientId: data.clientId, after: payload });
  return { ok: true, id: workflowId };
});

export const adminQueueWorkflowRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ workflowId: z.string().uuid(), inputPayload: z.record(z.string(), z.unknown()).default({}) }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: workflow } = await db4Admin.from("workflow_definitions").select("id,client_id,automation_id,status").eq("id", data.workflowId).maybeSingle();
  if (!workflow || String(workflow.client_id) !== context.tenant.clientId && !context.tenant.isSuperAdmin) throw new Error("Workflow not found");
  if (String(workflow.status) !== "active") throw new Error("Workflow must be active before it can run");
  const key = `manual:${workflow.id}:${context.userId}:${Date.now()}`;
  const { data: run, error } = await db4Admin.from("workflow_runs").insert({ workflow_id:workflow.id, client_id:workflow.client_id, automation_id:workflow.automation_id, idempotency_key:key, input_payload:data.inputPayload, status:"queued" }).select("id").single();
  if (error || !run) throw new Error(error?.message ?? "Could not queue workflow run");
  await auditMutation(context, { action: "workflow.run.queued", targetType: "workflow", targetId: workflow.id, clientId: String(workflow.client_id), after: { runId: run.id } });
  return { ok: true, runId: run.id };
});


export const adminCreateWorkflowWebhook = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((d: unknown) => z.object({ workflowId: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { data: workflow } = await db4Admin.from("workflow_definitions").select("id,client_id,status").eq("id", data.workflowId).maybeSingle();
  if (!workflow || (String(workflow.client_id) !== context.tenant.clientId && !context.tenant.isSuperAdmin)) throw new Error("Workflow not found");
  const endpointKey = randomBytes(24).toString("hex");
  const signingSecret = randomBytes(32).toString("hex");
  const endpointKeyHash = createHash("sha256").update(endpointKey).digest("hex");
  const { error } = await db4Admin.from("workflow_webhooks").insert({ workflow_id: workflow.id, endpoint_key_hash: endpointKeyHash, secret_ciphertext: encryptSecret(signingSecret), is_active: true });
  if (error) throw new Error(error.message);
  await auditMutation(context, { action: "workflow.webhook.created", targetType: "workflow", targetId: workflow.id, clientId: String(workflow.client_id) });
  const base = (process.env["FASTAPI_BACKEND_URL"] ?? "").replace(/\/$/, "");
  if (!base) throw new Error("FASTAPI_BACKEND_URL is not configured");
  return { ok: true, endpoint: `${base}/v1/workflows/webhook/${endpointKey}`, signingSecret };
});
