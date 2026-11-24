// Pure runtime gate for DB2 client_automations rows. Used by the worker and by tests.
export const BLOCKED_STATES = new Set([
  "paused",
  "stopped",
  "disabled",
  "suspended",
  "expired",
  "decommissioned",
  "killed",
  "provisioning",
]);

export type GateRow = {
  status?: unknown;
  run_state?: unknown;
  enabled?: unknown;
  is_active?: unknown;
  expires_at?: unknown;
};

/** null = may run. "testing" deployments only run executions explicitly marked as tests. */
export function evaluateRuntime(
  row: GateRow | null,
  opts: { isTest?: boolean; now?: number } = {},
): string | null {
  if (!row) return "automation_not_found";
  if (row.enabled === false || row.is_active === false) return "disabled";
  const states = [row.status, row.run_state].filter(Boolean).map(String);
  for (const s of states) if (BLOCKED_STATES.has(s)) return s;
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < (opts.now ?? Date.now()))
    return "expired";
  if (states.includes("testing") && !opts.isTest) return "testing_only";
  return null;
}
