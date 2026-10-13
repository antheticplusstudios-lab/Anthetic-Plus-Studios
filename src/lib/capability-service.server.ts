/**
 * Capability-request service. All authorization lives here (not in the UI), and all
 * storage goes through injected deps so the full lifecycle is testable without DBs.
 */
import {
  assertAdmin,
  assertTenantActive as assertActiveRbac,
  type RbacContext,
} from "@/lib/rbac.server";
import type { EngineKind } from "@/lib/automations";
import {
  validateProposal,
  type RawProposal,
  type ValidatedProposal,
  type IntegrationNeed,
} from "@/lib/tool-catalog";
import {
  applyApproval,
  emptyActivation,
  readinessTest,
  recheck,
  recordTest,
  revokeTool,
  rollback,
  type ActivationState,
} from "@/lib/capability-lifecycle";

export type ToolRequest = {
  id: string;
  request: string;
  proposal: ValidatedProposal;
  status: "pending_approval" | "approved" | "rejected";
  createdAt: string;
  createdBy: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
  refusedTools?: string[];
};

export type AutomationRef = { id: string; clientId: string; kind: EngineKind; name: string };

export type CapabilityDeps = {
  getAutomation(id: string): Promise<AutomationRef | null>;
  listAutomationIdsWithRequests(): Promise<string[]>;
  readRequests(automationId: string): Promise<ToolRequest[]>;
  writeRequests(automationId: string, list: ToolRequest[]): Promise<void>;
  readActivation(automationId: string): Promise<ActivationState | null>;
  writeActivation(automationId: string, s: ActivationState): Promise<void>;
  connected(automationId: string): Promise<Set<IntegrationNeed>>;
  audit(
    ctx: { userId: string },
    action: string,
    automationId: string,
    meta: Record<string, unknown>,
  ): Promise<void>;
  now(): string;
  uuid(): string;
};

type Ctx = RbacContext & { userId: string };

async function ownAutomation(deps: CapabilityDeps, ctx: Ctx, automationId: string) {
  assertActiveRbac(ctx);
  const a = await deps.getAutomation(automationId);
  // Same error for "missing" and "someone else's" so tenants can't probe ids.
  if (!a || a.clientId !== ctx.tenant.clientId) throw new Error("Automation not found.");
  return a;
}

async function adminAutomation(deps: CapabilityDeps, ctx: Ctx, automationId: string) {
  assertAdmin(ctx);
  const a = await deps.getAutomation(automationId);
  if (!a) throw new Error("Automation not found.");
  return a;
}

// ---------- client ----------

export async function clientSubmit(
  deps: CapabilityDeps,
  ctx: Ctx,
  automationId: string,
  request: string,
  raw: RawProposal,
) {
  const a = await ownAutomation(deps, ctx, automationId);
  const proposal = validateProposal(a.kind, raw, await deps.connected(a.id));
  const entry: ToolRequest = {
    id: deps.uuid(),
    request,
    proposal,
    status: "pending_approval",
    createdAt: deps.now(),
    createdBy: ctx.userId,
  };
  await deps.writeRequests(a.id, [entry, ...(await deps.readRequests(a.id))].slice(0, 50));
  await deps.audit(ctx, "automation.tool_request.proposed", a.id, {
    requestId: entry.id,
    tools: proposal.tools.map((t) => t.id),
  });
  return entry;
}

export async function clientView(deps: CapabilityDeps, ctx: Ctx, automationId: string) {
  const a = await ownAutomation(deps, ctx, automationId);
  const activation = (await deps.readActivation(a.id)) ?? emptyActivation();
  return {
    requests: await deps.readRequests(a.id),
    // Clients see status, not the audit trail (which names staff).
    tools: activation.tools.map(({ toolId, status, needs, updatedAt }) => ({
      toolId,
      status,
      needs,
      updatedAt,
    })),
  };
}

export async function ensureClientOwns(deps: CapabilityDeps, ctx: Ctx, automationId: string) {
  return ownAutomation(deps, ctx, automationId);
}

// ---------- admin ----------

export async function adminList(deps: CapabilityDeps, ctx: Ctx) {
  assertAdmin(ctx);
  const ids = await deps.listAutomationIdsWithRequests();
  const rows = await Promise.all(
    ids.map(async (id) => {
      const a = await deps.getAutomation(id);
      if (!a) return null;
      return {
        automation: a,
        requests: await deps.readRequests(id),
        activation: (await deps.readActivation(id)) ?? emptyActivation(),
        connected: [...(await deps.connected(id))],
      };
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => !!r);
}

export async function adminDecide(
  deps: CapabilityDeps,
  ctx: Ctx,
  automationId: string,
  requestId: string,
  decision: "approved" | "rejected",
  note: string,
) {
  const a = await adminAutomation(deps, ctx, automationId);
  if (note.trim().length < 3) throw new Error("A reason is required.");
  const list = await deps.readRequests(a.id);
  const item = list.find((r) => r.id === requestId);
  if (!item) throw new Error("Request not found.");
  if (item.status !== "pending_approval") throw new Error("This request was already decided.");
  const at = deps.now();
  let activation: ActivationState | null = null;
  if (decision === "approved") {
    const res = applyApproval(
      (await deps.readActivation(a.id)) ?? emptyActivation(),
      a.kind,
      item.proposal.tools.map((t) => t.id),
      item.id,
      await deps.connected(a.id),
      ctx.userId,
      at,
    );
    activation = res.state;
    item.refusedTools = res.refused;
    await deps.writeActivation(a.id, activation);
  }
  item.status = decision;
  item.decidedAt = at;
  item.decidedBy = ctx.userId;
  item.decisionNote = note.trim().slice(0, 500);
  await deps.writeRequests(a.id, list);
  await deps.audit(ctx, `automation.tool_request.${decision}`, a.id, {
    requestId,
    note: item.decisionNote,
    refused: item.refusedTools ?? [],
  });
  return { request: item, activation };
}

async function mutateActivation(
  deps: CapabilityDeps,
  ctx: Ctx,
  automationId: string,
  action: string,
  fn: (
    s: ActivationState,
    kind: EngineKind,
    connected: Set<IntegrationNeed>,
    at: string,
  ) => ActivationState,
  meta: Record<string, unknown> = {},
) {
  const a = await adminAutomation(deps, ctx, automationId);
  const current = (await deps.readActivation(a.id)) ?? emptyActivation();
  const next = fn(current, a.kind, await deps.connected(a.id), deps.now());
  await deps.writeActivation(a.id, next);
  await deps.audit(ctx, `automation.capability.${action}`, a.id, {
    version: next.version,
    ...meta,
  });
  return next;
}

export const adminRecheck = (deps: CapabilityDeps, ctx: Ctx, id: string) =>
  mutateActivation(deps, ctx, id, "recheck", (s, k, c, at) => recheck(s, k, c, ctx.userId, at));

export const adminRevoke = (
  deps: CapabilityDeps,
  ctx: Ctx,
  id: string,
  toolId: string,
  note: string,
) =>
  mutateActivation(
    deps,
    ctx,
    id,
    "revoked",
    (s, _k, _c, at) => revokeTool(s, toolId, ctx.userId, at, note),
    { toolId },
  );

export const adminRollback = (deps: CapabilityDeps, ctx: Ctx, id: string, version: number) =>
  mutateActivation(
    deps,
    ctx,
    id,
    "rollback",
    (s, k, c, at) => rollback(s, k, version, c, ctx.userId, at),
    { to: version },
  );

export const adminTest = (deps: CapabilityDeps, ctx: Ctx, id: string, toolId: string) =>
  mutateActivation(
    deps,
    ctx,
    id,
    "tested",
    (s, k, c, at) => {
      const r = readinessTest(k, s, toolId, c);
      return recordTest(s, toolId, r.ok, r.detail, ctx.userId, at);
    },
    { toolId },
  );
