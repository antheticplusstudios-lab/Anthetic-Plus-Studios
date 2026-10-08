# AntheticPlus Studios

AntheticPlus Studios is a self-hostable AI automation SaaS built around four canonical products:

1. **AI Voice & SMS Receptionist** — `voice-sms-receptionist`
2. **AI Lead Capture & Smart Qualifier** — `lead-capture-qualifier`
3. **AI Knowledge Base Support Agent** — `knowledge-base-support`
4. **AI Social DM & Messaging Assistant** — `social-dm-assistant`

The application is designed to run independently on Vercel or any Node-compatible host. It uses four isolated Supabase/Postgres projects plus Redis and an optional FastAPI runtime/worker tier.

## Architecture

```text
AntheticPlus Studios
        |
        +-- DB1: identity, auth, tenancy, roles, audit
        +-- DB2: orders, payments, subscriptions, automations, integrations
        +-- DB3: encrypted AI keys, provider pools, knowledge/RAG, AI telemetry
        +-- DB4: CRM, conversations, executions, durable workflow queue
        +-- Redis: rate limits, schedule locks, transient state
        +-- TanStack Start / Nitro: web application + server functions
        +-- FastAPI: runtime gateway, widget APIs, webhooks and WebSockets
        +-- Python workers: outbox processing and durable workflow execution
```

There are no cross-database foreign keys. Server-side services enforce tenant boundaries and carry canonical IDs between databases.

## Requirements

- Node.js **20.19+**
- npm **10+**
- Python **3.11+** for the FastAPI/worker tier
- Redis 6+
- Four Supabase projects configured with the SQL in `docs/database-bootstrap/`

## Install with npm

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

Development:

```bash
npm run dev
```

Production after a successful build:

```bash
npm start
```

The production server entry is Nitro's `.output/server/index.mjs`, so the same build can be deployed to a normal Node host. Vercel uses the repository's `vercel.json` and TanStack Start integration.

## Vercel

1. Import this repository into Vercel.
2. Keep the framework as **TanStack Start**.
3. Add the variables from `.env.example` to the correct Vercel environments.
4. Set `CRON_SECRET` for scheduled endpoints.
5. Deploy.

Service-role keys, the DB3 master encryption key, Redis credentials, provider credentials and cron secrets must never be exposed through `VITE_*` variables.

## Generic Node hosting

```bash
npm ci
npm run build
npm start
```

Run behind your reverse proxy/load balancer and set `APP_URL`/`VITE_APP_URL` to the public HTTPS origin. The FastAPI runtime and workers can run as separate services on the same machine or elsewhere.

## FastAPI / workers

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run the workers separately:

```bash
python -m app.outbox_worker
python -m app.workflows
```

## Environment

Copy `.env.example` to `.env` for local development. Production secrets belong in Vercel, your host's secret manager, or the process environment; never commit `.env`.

The browser only receives DB1's public auth configuration and public API URLs. DB1–DB4 service keys and the DB3 master encryption key remain server-side.

## Database bootstrap

Apply only the matching SQL to each database:

- `01_db1_app_auth.sql` → DB1
- `02_db2_app_billing.sql` → DB2
- `03_db3_app_ai.sql` → DB3
- `04_db4_app_crm.sql` → DB4
- `05_db1_bootstrap_first_owner.sql` → DB1, after creating the first owner

Apply the DB4 workflow lease migration in `docs/database-bootstrap/migrations/2026-10-07_db4_workflow_run_claim.sql` before starting Python workflow workers. Run the corresponding verification SQL in each project.


## Runtime lifecycle

Orders never activate an automation by themselves. The intended lifecycle is:

`payment pending → human verification → provisioning → configuration → testing → successful test → activation → execution → recorded result → dashboard/admin state`

Activation is server-gated by a successful test. Paused, expired, disabled and setup states cannot execute production work.

## Provider pools

DB3 provider credentials are encrypted server-side. The runtime supports balanced, weighted and priority/fallback ordering and records provider attempts/failures for failover and diagnostics. Python and TypeScript routing use the same pool concepts.

## Security

- DB1 owns authentication, tenancy and authorization context.
- DB2 owns automation lifecycle and billing state.
- DB3 stores encrypted provider credentials; the encryption master key is server-only.
- DB4 owns durable execution state and workflow leases.
- Admin mutations are authenticated and audited.
- Browser code never receives service-role or provider secrets.
- Public widget requests validate signed installation tokens and allowed origins.
- Cron endpoints require the configured cron bearer secret.

## Branding

The application is branded **AntheticPlus Studios** throughout the customer and admin experience. There is no hosted-platform dependency or vendor-specific runtime required by the application source.

## Verification

Local source validation includes TypeScript parsing and Python compilation. Full dependency-backed npm typecheck/lint/test/build and live DB/provider/Redis execution require network access and your real deployment credentials. Those infrastructure checks must be run in the target environment before declaring a deployment operational.

## Independent deployment

AntheticPlus Studios is a standard npm/Node application and does not require a hosted IDE or vendor runtime. Use Node 20.19+ and npm 10+.

- Local/Node host: `npm ci && npm run build && npm start`
- Vercel: import the repository and deploy as a TanStack Start application; configure the environment variables from `.env.example` in Project Settings.
- Docker: `docker build -t antheticplus . && docker run --env-file .env -p 3000:3000 antheticplus`

All DB service keys and encryption secrets are server-only. Never expose them through `VITE_*` variables.
