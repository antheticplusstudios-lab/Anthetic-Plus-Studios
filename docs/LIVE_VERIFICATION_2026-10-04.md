# Live verification — 2026-10-04

## Supabase databases

| DB | Project | Result |
|---|---|---|
| DB1 | `dedmsffcvpchzywiggmg` | Tenant-binding guard installed; protected SECURITY DEFINER RPC execution revoked; no invalid default-organization bindings found |
| DB2 | `zecusgollvmtzufzmehv` | `orders.total_amount` and automation enum values verified; live schema intact |
| DB3 | `lktejvslktfazbqitoaq` | AI/RAG tables verified; RLS enabled on the four previously public AI tables |
| DB4 | `iztbylxqvvrhsyislqlk` | Execution/attempt/event tables and RPCs verified; conversation + scoped event dedup indexes installed; seven legacy public tables locked behind RLS |

## DB4 transactional verification

A rollback-only transaction verified:
- idempotent execution enqueue
- exclusive worker claim
- successful finish
- same provider event ID can exist for two different automations
- no verification rows were retained

## Application fixes in this archive

- Webhook duplicate lookup is scoped by `automation_id`.
- DB4 webhook dedup migration removes the old global uniqueness constraint after the route fix.
- Automation conversations now use valid DB4 channel enum values.
- Automation messages no longer write nonexistent `topic`/`extension` columns.
- Lead inserts avoid NULLs in required DB4 fields.
- Knowledge-base escalation writes valid JSON transcript, sentiment, and visitor contact values.
- Social DM channels are mapped to the DB4 enum instead of invented `dm_*` values.
- Python backend compilation passed.

## Remaining production blockers

The Vercel project currently exposes only these direct production variables:
- `FASTAPI_WS_URL`
- `FASTAPI_BACKEND_URL`
- `VITE_FASTAPI_WS_URL`
- `VITE_API_GATEWAY_URL`

The application server requires these server-only variables:
`DB1_URL`, `DB1_SERVICE_KEY`, `DB2_URL`, `DB2_SERVICE_KEY`, `DB3_URL`, `DB3_SERVICE_KEY`, `DB4_URL`, `DB4_SERVICE_KEY`, and `CRON_SECRET`.

Do not put service keys into the browser or commit them to Git. Add them to Vercel Production Environment Variables through the Vercel UI/CLI.

The connected GitHub integration currently returns HTTP 403 for write operations, so this archive cannot be pushed automatically from this environment. The Vercel project build command has been changed to `npm run build` and install command to `npm install`, but a new production deployment cannot be triggered until the source changes are pushed or uploaded through a permitted deployment path.
