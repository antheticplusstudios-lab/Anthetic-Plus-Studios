# AntheticPlus Four-Database Architecture

## Rule

AntheticPlus uses four separate Supabase projects/Postgres databases. Do not collapse them into schemas of one project.

## Ownership matrix

| Database | Authoritative data | Primary runtime owner |
|---|---|---|
| DB1 `app_auth` | Auth identity, organizations/client IDs, roles, restrictions, staff controls, platform settings, audit/outbox | Supabase Auth + Vercel/FastAPI auth layer |
| DB2 `app_billing` | Orders, subscriptions, automation lifecycle, installations, scripts, widget config, usage, health | FastAPI + billing/admin server functions |
| DB3 `app_ai` | LLM provider pool, encrypted keys, AI config, prompts, RAG documents/chunks, vectors, cache, evaluations | FastAPI AI/RAG runtime |
| DB4 `app_crm` | Clients, conversations, messages, leads, appointments, Round-Robin, workflows and execution history | FastAPI + CRM/workflow workers |

## Canonical identifiers

`user_id` is the immutable Supabase Auth user ID in DB1.

`organization_id` is the tenant ID in DB1. `client_id` is intentionally the same UUID as `organization_id`, so every downstream database has one unambiguous customer/account identifier.

`automation_id` belongs to DB2. DB3 and DB4 reference it as an external UUID with no cross-database FK.

`conversation_id` belongs to DB4.

`event_id` is the ID of the originating local outbox event.

## Cross-database consistency

Use the outbox pattern for cross-database side effects. Every event has:

- a UUID event ID
- an idempotency key
- payload metadata
- attempt state
- retry/dead-letter state

Consumers record the event ID in their local `processed_events` table before or atomically with their local effect. Usage metering uses idempotency keys so repeated delivery does not double-count usage.

## Security boundary

Only DB1's publishable/anon key is safe for browser authentication. DB2, DB3, and DB4 are service-side databases. Their tables and internal RPCs revoke `anon`/`authenticated` access; service-role access stays in Vercel server functions/FastAPI/workers.

The Origin header is an installation-context check only. Widget authentication is the DB2 installation token plus domain allow-list plus automation/subscription/runtime eligibility.

## Runtime flow

```text
Website
  -> widget.js
  -> FastAPI /v1/widget/config + /v1/widget/chat
  -> DB2 installation/runtime eligibility
  -> DB1 account restriction check
  -> DB3 AI configuration + RAG + provider router
  -> DB4 conversation/messages/leads
  -> DB2 usage meter
```

For authenticated application requests:

```text
Browser
  -> DB1 Supabase Auth
  -> Vercel server route / FastAPI gateway
  -> tenant context
  -> DB2/DB3/DB4 service operations
  -> audit/outbox when required
```

## Redis responsibilities

Redis is not a source of truth. It provides transient acceleration for rate limiting, workflow schedule locks, and other short-lived runtime state. Durable configuration/history remains in DB4.

## Workflow Automation

Workflow definitions and state live in DB4. Workers execute steps with persisted run/step state. Supported runtime concepts include conditions with true/false jumps, set values, lead creation, Round-Robin assignment, message sending, AI completion, waits/resumption, webhooks, and usage metering. Scheduled workflows use durable DB4 schedules with Redis locking and cron expressions.

## Round-Robin

Round-Robin configuration and assignment history live in DB4. Teams support assignment strategy, priority, member weights, availability, active/workload caps, fallback behavior, business-hour metadata and assignment history. Redis may accelerate cursor/lock operations, but the durable state is DB4.
