/**
 * Pure capability lifecycle for approved tool requests. Approval never runs code:
 * it re-validates each tool against the automation's own catalog and only marks a
 * tool "active" when its required integration is connected. Every change appends a
 * versioned snapshot so it can be audited and rolled back.
 */
import type { EngineKind } from "@/lib/automations";
import { TOOL_CATALOG, INTEGRATION_LABEL, type IntegrationNeed } from "@/lib/tool-catalog";

export type ToolActivation = {
  toolId: string;
  status: "active" | "blocked" | "revoked";
  needs: IntegrationNeed | null;
  requestId: string | null;
  updatedAt: string;
  lastTest?: { at: string; ok: boolean; detail: string } | undefined;
};

export type ActivationEvent = {
  version: number;
  at: string;
  by: string;
  action: "approved" | "recheck" | "revoked" | "rollback" | "tested";
  note?: string | undefined;
  snapshot: ToolActivation[];
};

export type ActivationState = {
  version: number;
  tools: ToolActivation[];
  history: ActivationEvent[];
};

export const emptyActivation = (): ActivationState => ({ version: 0, tools: [], history: [] });

export function catalogFor(kind: EngineKind) {
  return new Map(TOOL_CATALOG[kind].map((t) => [t.id, t]));
}

function resolve(kind: EngineKind, toolId: string, connected: ReadonlySet<IntegrationNeed>) {
  const def = catalogFor(kind).get(toolId);
  if (!def) return null;
  const needs =
    def.requiresIntegration && !connected.has(def.requiresIntegration)
      ? def.requiresIntegration
      : null;
  return { needs, status: needs ? ("blocked" as const) : ("active" as const) };
}

function commit(
  state: ActivationState,
  tools: ToolActivation[],
  by: string,
  action: ActivationEvent["action"],
  at: string,
  note?: string,
): ActivationState {
  const version = state.version + 1;
  return {
    version,
    tools,
    history: [{ version, at, by, action, note, snapshot: tools }, ...state.history].slice(0, 50),
  };
}

/** Approval: re-validates against this automation's catalog. Unknown tools are refused, not stored. */
export function applyApproval(
  state: ActivationState,
  kind: EngineKind,
  toolIds: string[],
  requestId: string,
  connected: ReadonlySet<IntegrationNeed>,
  by: string,
  at: string,
): { state: ActivationState; refused: string[] } {
  const refused: string[] = [];
  const byId = new Map(state.tools.map((t) => [t.toolId, t]));
  for (const id of toolIds) {
    const r = resolve(kind, id, connected);
    if (!r) {
      refused.push(id);
      continue;
    }
    byId.set(id, { toolId: id, status: r.status, needs: r.needs, requestId, updatedAt: at });
  }
  return {
    state: commit(state, [...byId.values()], by, "approved", at, `request ${requestId}`),
    refused,
  };
}

/** Re-evaluates blocked/active tools after integrations change. Revoked tools stay revoked. */
export function recheck(
  state: ActivationState,
  kind: EngineKind,
  connected: ReadonlySet<IntegrationNeed>,
  by: string,
  at: string,
): ActivationState {
  const tools = state.tools.flatMap((t): ToolActivation[] => {
    if (t.status === "revoked") return [t];
    const r = resolve(kind, t.toolId, connected);
    if (!r) return [{ ...t, status: "revoked", needs: null, updatedAt: at }];
    return r.status === t.status && r.needs === t.needs ? [t] : [{ ...t, ...r, updatedAt: at }];
  });
  return commit(state, tools, by, "recheck", at);
}

export function revokeTool(
  state: ActivationState,
  toolId: string,
  by: string,
  at: string,
  note?: string,
) {
  if (!state.tools.some((t) => t.toolId === toolId))
    throw new Error("Tool is not part of this automation.");
  const tools = state.tools.map((t) =>
    t.toolId === toolId ? { ...t, status: "revoked" as const, needs: null, updatedAt: at } : t,
  );
  return commit(state, tools, by, "revoked", at, note);
}

/** Restores an earlier snapshot, re-validated against today's catalog and integrations. */
export function rollback(
  state: ActivationState,
  kind: EngineKind,
  version: number,
  connected: ReadonlySet<IntegrationNeed>,
  by: string,
  at: string,
) {
  const ev = state.history.find((h) => h.version === version);
  if (!ev) throw new Error("That version doesn't exist.");
  const tools = ev.snapshot.flatMap((t): ToolActivation[] => {
    if (t.status === "revoked") return [{ ...t, updatedAt: at }];
    const r = resolve(kind, t.toolId, connected);
    return r ? [{ ...t, ...r, updatedAt: at }] : [];
  });
  return commit(state, tools, by, "rollback", at, `to v${version}`);
}

export function recordTest(
  state: ActivationState,
  toolId: string,
  ok: boolean,
  detail: string,
  by: string,
  at: string,
) {
  const tools = state.tools.map((t) =>
    t.toolId === toolId ? { ...t, lastTest: { at, ok, detail } } : t,
  );
  return commit(state, tools, by, "tested", at, `${toolId}: ${ok ? "pass" : "fail"}`);
}

export const activeToolIds = (s: ActivationState | null) =>
  new Set((s?.tools ?? []).filter((t) => t.status === "active").map((t) => t.toolId));

/** Readiness test: confirms the tool is in the catalog, active, and its integration is connected. No side effects. */
export function readinessTest(
  kind: EngineKind,
  state: ActivationState,
  toolId: string,
  connected: ReadonlySet<IntegrationNeed>,
): { ok: boolean; detail: string } {
  const t = state.tools.find((x) => x.toolId === toolId);
  if (!t) return { ok: false, detail: "Tool was never approved for this automation." };
  if (t.status === "revoked") return { ok: false, detail: "Tool has been revoked." };
  const r = resolve(kind, toolId, connected);
  if (!r) return { ok: false, detail: "Tool is no longer in this automation's catalog." };
  if (r.needs) return { ok: false, detail: `Needs ${INTEGRATION_LABEL[r.needs]}.` };
  return { ok: true, detail: "Ready: in catalog, approved and its connection is available." };
}

/** Maps DB2 integration_connections providers + automation settings to integration needs. */
export function connectedNeeds(
  providers: string[],
  settings: Record<string, unknown>,
  env: { resend: boolean },
): Set<IntegrationNeed> {
  const p = new Set(providers.map((x) => x.toLowerCase()));
  const has = (k: string) =>
    typeof settings[k] === "string" && String(settings[k]).trim().length > 0;
  const out = new Set<IntegrationNeed>();
  if (p.has("google_calendar") || p.has("google")) out.add("calendar");
  if (p.has("twilio")) {
    out.add("sms");
    out.add("telephony");
  }
  if (p.has("stripe") || p.has("paddle") || has("payment_link_url")) out.add("payments");
  if (env.resend || p.has("resend")) out.add("email");
  if (p.has("hubspot") || p.has("crm_webhook") || has("webhook_url") || has("crm_webhook_url"))
    out.add("crm");
  return out;
}
