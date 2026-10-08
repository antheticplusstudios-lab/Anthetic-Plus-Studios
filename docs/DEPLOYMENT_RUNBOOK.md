# AntheticPlus Production Deployment Runbook

## 1. Create infrastructure

Create four separate Supabase projects/databases across the two Supabase organizations/accounts you chose:

- DB1 `app_auth`
- DB2 `app_billing`
- DB3 `app_ai`
- DB4 `app_crm`

Also provision:

- Vercel project for the TanStack Start app
- FastAPI service at `api.antheticplus.com`
- Redis instance reachable by FastAPI/workers
- one worker process for the outbox consumer
- one worker process for durable execution

## 2. Run database bootstrap SQL

Run each file in the matching Supabase SQL editor/project. Never run the four scripts in the same project.

```text
DB1 -> docs/database-bootstrap/01_db1_app_auth.sql
DB2 -> docs/database-bootstrap/02_db2_app_billing.sql
DB3 -> docs/database-bootstrap/03_db3_app_ai.sql
DB4 -> docs/database-bootstrap/04_db4_app_crm.sql
```

Create the first Auth user in DB1, obtain that user's Auth UUID, then run:

```text
DB1 -> docs/database-bootstrap/05_db1_bootstrap_first_owner.sql
```

Run the matching verification SQL after each bootstrap.

## 3. Configure secrets

Vercel/frontend-safe variables:

```text
VITE_DB1_URL
VITE_DB1_ANON_KEY
VITE_APP_URL
VITE_API_GATEWAY_URL
```

Server-only variables:

```text
DB1_URL
DB1_ANON_KEY
DB1_SERVICE_KEY
DB2_URL
DB2_SERVICE_KEY
DB3_URL
DB3_SERVICE_KEY
DB4_URL
DB4_SERVICE_KEY
ANTHETICPLUS_DB3_MASTER_KEY
REDIS_URL
FASTAPI_BACKEND_URL
FASTAPI_WS_URL
NITRO_PRESET=vercel
ALLOWED_WIDGET_HOSTS=antheticplus.vercel.app,antheticplus.com
```

`ALLOWED_WIDGET_HOSTS` is a comma-separated list of trusted root hosts. Each configured root automatically allows that host and its subdomains. For example, `antheticplus.com` covers `www.antheticplus.com` and `client.antheticplus.com`. Browser `Origin` does not include URL paths, so `/anything` does not require another entry. Do not configure a broad host such as `vercel.app`; add your specific Vercel hostname now and add `antheticplus.com` when the custom domain is purchased.

Never place a service-role key, provider API key, encryption key, or Redis credential in Git or a `VITE_*` variable.

## 4. Deploy the web app

```bash
npm install
npm run build
```

Deploy through Vercel/Git. Configure Preview and Production environment values separately where appropriate.

## 5. Deploy FastAPI

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Expose the service as `https://api.antheticplus.com`.

## 6. Start workers

```bash
python -m app.outbox_worker
python -m app.workflows
```

Keep at least one durable process for each worker. Multiple outbox workers are safe because the database claim RPC uses `FOR UPDATE SKIP LOCKED`; workflow schedule acquisition also uses Redis locks.

## 7. Configure AI providers

Add provider credentials through the authenticated admin LLM/provider controls. Keys are encrypted before storage in DB3 and are never returned to the browser.

The current backend supports OpenAI, Groq and OpenRouter chat completion. Anthropic is present in the DB3 provider catalog but is not used by the current FastAPI completion implementation until an Anthropic-specific adapter is added.

## 8. Validate the production path

Test all of these before switching customer traffic:

- DB1 signup creates the profile/organization/owner role.
- An approved order provisions a DB2 automation.
- Installation token generation works and old tokens are invalidated after rotation.
- Allowed-domain widget loading works; an unlisted domain is rejected.
- DB1 owner restriction stops widget runtime.
- Subscription expiry and grace-period behavior match business rules.
- DB3 embeddings are generated and `match_kb_chunks` returns results.
- DB4 conversations and messages persist.
- Usage meter increments idempotently.
- Round-Robin assignments persist and respect availability/workload.
- Workflow runs execute, wait/resume, retry, branch and record step history.
- Outbox failures retry and eventually dead-letter.
- Audit logs capture privileged admin changes.

## 9. Cutover

Keep the old single-Supabase project disconnected from the new runtime once the smoke tests pass. Do not run the files in `docs/legacy-single-db/` against the new production projects.
