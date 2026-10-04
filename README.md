# AntheticPlus Studios

Production AI automation SaaS for deploying, operating, and administering four automation products:

- AI Receptionist
- Messaging AI
- AI Sales Agent
- Workflow Automation

## Production architecture

AntheticPlus uses **four completely separate Supabase/Postgres databases**, not four schemas inside one database.

```text
                         AntheticPlus Platform
                                  |
                    +-------------+-------------+
                    |                           |
              Supabase Org #1             Supabase Org #2
                    |                           |
              +-----+-----+               +-----+-----+
              |           |               |           |
           DB1 Auth   DB2 Billing       DB3 AI      DB4 CRM
```

### DB1 — Auth / Identity

Supabase Auth, profiles, organizations, canonical client IDs, signup-origin metadata, memberships, roles, restrictions, staff permissions, platform settings, feature flags, audit/activity logs, and the DB1 outbox.

### DB2 — Billing / Automation Runtime

Orders, payment verification, subscriptions and grace periods, automation records, installation history, install scripts/tokens, widget configuration, automation tasks/integrations, usage meters/events, health records, and the DB2 outbox.

### DB3 — AI / RAG

AI configuration, prompt versions, LLM provider pool and encrypted provider credentials, LLM request telemetry, knowledge bases, crawls, documents, pgvector chunks, semantic cache, evaluations, and the DB3 outbox.

### DB4 — CRM / Conversations / Workflow

CRM clients, conversations, messages, leads, appointments, availability, escalations, diagnostics, first-class Round-Robin configuration/state/history, workflow definitions/steps/schedules/webhooks, durable workflow runs, and the DB4 outbox.

There are **no cross-database foreign keys**. Downstream databases store canonical UUIDs and communicate through server-side services/events.

## Runtime topology

- **Vercel:** TanStack Start web application.
- **FastAPI:** `api.antheticplus.com` gateway, widget runtime, authenticated service APIs, webhooks, and WebSockets.
- **Redis:** rate limiting, workflow schedule locks, Round-Robin acceleration, and transient runtime state.
- **Workers:** outbox processor and durable Workflow Automation executor.
- **Browser:** only receives DB1 Auth publishable/anon configuration. Service-role keys and provider secrets stay server-side.

## Canonical IDs

```text
user_id         = DB1 auth.users.id
organization_id = DB1 organizations.id
client_id       = DB1 organizations.id
automation_id   = DB2 client_automations.id
conversation_id = DB4 conversations.id
event_id        = local outbox_events.id
```

## Local development

### Web application

```bash
npm install
npm run dev
```

### FastAPI

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run workers separately:

```bash
python -m app.outbox_worker
python -m app.workflows
```

## Database bootstrap

The target database SQL is in `docs/database-bootstrap/` and in the separate SQL package supplied with this project.

**Run the four main SQL files only in their corresponding Supabase projects:**

1. `01_db1_app_auth.sql` → DB1 Auth project
2. `02_db2_app_billing.sql` → DB2 Billing project
3. `03_db3_app_ai.sql` → DB3 AI project
4. `04_db4_app_crm.sql` → DB4 CRM project
5. Create the first DB1 Auth user, then run `05_db1_bootstrap_first_owner.sql` for that user's UUID.
6. Run the matching verification SQL in the same project before connecting production application credentials.

Do **not** run the legacy single-database migrations under `docs/legacy-single-db/`.

## Environment

Copy `.env.example` and provide the production values only in your deployment secret store. Never commit `.env`, service-role keys, provider keys, encryption keys, or Redis credentials.

The frontend build expects the DB1 browser-safe values and `VITE_API_GATEWAY_URL`. The server and FastAPI processes require the four DB service credentials plus Redis and the DB3 encryption key.

## Security model

All privileged writes are server-authorized, tenant-scoped, validated, and audited where appropriate. Runtime eligibility is checked from DB2 plus DB1 account restrictions and DB3 AI status. The public widget requires a signed installation token lookup in DB2 and validates the request Origin against the automation's allowed domains; Origin is not treated as authentication by itself.

## Important verification note

This source package has been statically checked for Python syntax and SQL structure. A live Supabase migration, provider connection, Redis connection, and production Vercel build require your actual deployment credentials and infrastructure and therefore were not executed from this workspace.
