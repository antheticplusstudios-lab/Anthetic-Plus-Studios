# AntheticPlus Studios — Strict Audit & Fix Pass

Date: 2026-10-05

## Scope

This pass treats the four live Supabase projects as the runtime database source of truth. The four project schemas were inspected read-only through `information_schema` and the live RPC signatures were inspected through `pg_proc`.

No production database mutation was performed by this audit.

## Critical fixes implemented

### 1. Four-database typing was corrected

`src/server/db/clients.server.ts` no longer exposes `SupabaseClient<any>`.

It now has a per-database type map:

- DB1 → `DB1Database`
- DB2 → `DB2Database`
- DB3 → `DB3Database`
- DB4 → `DB4Database`

`src/server/db/server-db.types.ts` was rebuilt from the live schemas for every table referenced by application code.

### 2. DB2 billing/payment schema drift was fixed

The code had been using obsolete fields such as:

- `subscriptions.automation_id`
- `subscriptions.plan_slug`
- `subscriptions.expires_at`
- `payment_verifications.client_id`
- `payment_verifications.rejection_reason`
- `payment_verifications.transaction_id`
- `payment_verifications.verified_by_user_id`
- `payment_verifications.verified_at`
- `client_automations.order_id`
- `client_automations.origin_domain`
- `client_automations.widget_config_version`
- `client_automations.last_seen_at`
- `automation_installations.status`

These were replaced with the live schema equivalents or compatibility data stored in `metadata` where appropriate.

### 3. Order/payment flow was repaired

`orders-schema.ts`, client order submission, admin verification, payment history, renewal payment submission, and voice account context now use the live DB2 billing model.

Payment verification now resolves the client through the order rather than expecting a nonexistent `payment_verifications.client_id`.

### 4. Provisioning flow was repaired against the live schema

Provisioning now:

- links automations to subscriptions through `client_automations.subscription_id`;
- links subscriptions to orders through `subscriptions.order_id`;
- uses `subscriptions.current_period_end`;
- uses live `automation_installations` columns;
- removes the nonexistent `ai_configs.tool_config` write;
- generates the installation token through the live RPC;
- writes crawl/knowledge records using the live DB3 schema.

### 5. Widget/runtime heartbeat was repaired

The old `client_automations.last_seen_at/last_seen_origin` writes were removed.

The runtime now uses `client_automations.last_heartbeat_at` and the live `automation_installations.installation_status/last_seen_at` fields.

### 6. Automation metadata compatibility was repaired

Legacy UI concepts such as `assigned_phone_number` and `webhook_url` are no longer written as nonexistent DB2 columns. They are carried through `client_automations.metadata` and mapped back to the application response shape.

HMAC rotation now uses the live `automation_credential_rotations` table instead of nonexistent columns on `client_automations`.

### 7. Lifecycle/runtime RPC calls were checked

Live signatures verified include:

- `set_automation_runtime_state(... p_idempotency_key ...)`
- `enqueue_outbox(... p_idempotency_key ...)`
- `generate_automation_token(...)`
- `increment_usage_meter(... p_idempotency_key ...)`
- DB4 execution queue RPCs
- DB3 knowledge RPCs

Missing runtime idempotency arguments were added where required.

### 8. N+1 conversation counting was removed

Automation conversation counts are now accumulated in the existing conversation scan instead of filtering the complete conversation list once per automation.

## Strict checks performed

| Check                                                     | Result                                        |
| --------------------------------------------------------- | --------------------------------------------- |
| TypeScript parser over all 234 TS/TSX files               | **PASS — 0 syntax diagnostics**               |
| Literal DB `.select()` fields vs live DB schemas          | **PASS — 0 mismatches**                       |
| Critical server files explicit `any`                      | **PASS — 0**                                  |
| Direct application table names vs live DB table inventory | **PASS**                                      |
| Live DB2 RPC signatures inspected                         | **PASS**                                      |
| Live DB1–DB4 security/performance advisors inspected      | **DONE — findings remain**                    |
| Full `npm ci`                                             | **BLOCKED — registry unavailable in sandbox** |
| Full ESLint                                               | **BLOCKED — dependencies unavailable**        |
| Full TypeScript typecheck                                 | **BLOCKED — dependencies unavailable**        |
| Full production build                                     | **BLOCKED — dependencies unavailable**        |
| Full test suite                                           | **BLOCKED — dependencies unavailable**        |

## Important remaining debt — not falsely marked fixed

The project still contains **155 explicit `any` occurrences** across the broader source tree. The remaining concentration is mostly generated route code and secondary modules such as the dashboard portal, admin-center, voice-agent/LLM-adjacent code, and other UI modules.

This pass intentionally does **not** claim the entire repository is lint-clean.

The critical database/runtime layer modified in this pass has zero explicit `any` occurrences.

## Live database findings not silently changed

The Supabase advisors report existing production findings including:

- DB1 RLS-enabled tables without policies;
- DB1 auth leaked-password protection disabled;
- unindexed foreign keys;
- RLS auth init-plan performance warnings;
- multiple permissive RLS policies;
- DB2/DB4 RLS-enabled tables without policies.

These are database-policy changes and were deliberately **not auto-mutated** during a source-code repair pass. Applying them blindly could lock out service-role/application paths or alter tenant isolation.

## Bottom line

This is a substantially deeper pass than the previous ZIP pass because the code was checked against the **live four-database contracts**, not merely the repository's bootstrap SQL.

The project is **not honestly declared 100% clean yet** until dependencies can be installed and the real lint/typecheck/build/test pipeline is executed.
