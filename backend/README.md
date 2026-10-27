# AntheticPlus FastAPI Runtime

This service is the server-side gateway/runtime for the four-database architecture. Browser code never receives service-role keys or provider secrets.

## Local runtime

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run the workers in separate processes after Redis is available:

```bash
python -m app.outbox_worker
python -m app.workflows
```

## Production endpoints

- `GET /health` — DB1/DB2/DB3/DB4 connectivity probe.
- `POST /v1/runtime/{automation_id}/eligibility` — authenticated runtime eligibility.
- `POST /v1/health/automation/{automation_id}` — authenticated automation health view.
- `GET /v1/widget/config` — public widget configuration after token/domain/subscription/runtime checks.
- `POST /v1/widget/resolve` — public installation resolution after validation.
- `POST /v1/widget/chat` — public widget chat with Redis rate limiting and DB4 persistence.
- `POST /v1/workflows/webhook/{endpoint_key}` — signed workflow webhook ingestion.
- `POST /v1/knowledge/documents` — authenticated RAG document ingestion/embedding.
- `WS /ws/chat/{conversation_id}` — authenticated-by-installation widget WebSocket channel.

## Webhook signing

Workflow webhooks use an endpoint key plus an HMAC SHA-256 signature. The caller sends:

```text
X-AntheticPlus-Timestamp: <unix timestamp>
X-AntheticPlus-Signature: sha256=<hex hmac>
```

The signature covers `<timestamp>.<raw request body>`. Requests older than five minutes are rejected. Send `X-AntheticPlus-Event-ID` when your provider has a stable event ID so webhook retries are idempotent; otherwise AntheticPlus falls back to a hash of the raw payload.

## Production topology

- Vercel: TanStack Start web application
- FastAPI: `api.antheticplus.com` gateway/runtime/webhooks/WebSocket
- Redis: rate limiting, schedule locks and transient runtime state
- Workers: DB outbox processing and durable durable execution execution
- DB1: auth/identity
- DB2: billing + automation runtime
- DB3: AI + RAG
- DB4: CRM + conversations + Round-Robin + workflows
