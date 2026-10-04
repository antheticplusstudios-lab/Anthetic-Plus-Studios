# Gen 2 readiness and database alignment

## Confirmed architecture

The application is a four-database Gen 2 deployment:

- DB1: auth / organizations / roles / platform controls
- DB2: billing / `client_automations` / installations / runtime / usage / health
- DB3: AI / knowledge / LLM request ledger
- DB4: CRM / conversations / Round-Robin / workflows

The application intentionally references tables outside the `automation_*` namespace. Those references must not be removed simply because an information-schema search returned a list of `automation_*` tables.

## Required DB2 foundation

The canonical DB2 bootstrap is:

`docs/database-bootstrap/02_db2_app_billing.sql`

It defines the Gen 2 automation lifecycle tables and required runtime RPCs, including:

- `client_automations`
- `automation_installations`
- `automation_tasks`
- `integration_connections`
- `usage_events`
- `usage_meters`
- `automation_health_checks`
- `automation_health_state`
- `automation_health`
- `outbox_events`
- `processed_events`
- `set_automation_runtime_state`
- `generate_automation_token`
- `resolve_widget_installation`
- `automation_local_runtime_state`
- `increment_usage_meter`

Do not substitute guessed schemas for unrelated `automation_*` tables in another database.

## Runtime environment

The frontend/browser side requires:

- `VITE_DB1_URL`
- `VITE_DB1_ANON_KEY`
- `VITE_APP_URL`
- `VITE_API_GATEWAY_URL` when calling the FastAPI gateway from the browser

Server-side requires the DB1–DB4 service credentials and the DB3 encryption key where applicable.

`FASTAPI_BACKEND_URL` is intentionally required for server-side workflow calls. There is no longer a hard-coded deployment URL in application code.

## Validation

From the project root:

```bash
npm install
npm run typecheck
npm run build
```

The database verification scripts under `docs/database-bootstrap/07_db1_verify.sql` through `10_db4_verify.sql` should be run against their corresponding Supabase projects before declaring the deployment ready.
