# Anthetic Plus Studios — Full Audit Snapshot

## Confirmed fixes applied to this audit copy

1. Fixed the malformed multiline string in `src/lib/voice-agent.functions.ts`.
2. Replaced all 75 deprecated `.inputValidator(...)` calls with `.validator(...)`.
3. Updated `.env.example` references from the legacy backend deployment to the new backend deployment.
4. Removed obsolete Bun/Lovable build artifacts (`bunfig.toml`, `bun.lock`, `.lovable/`, and the unused Lovable runtime reporter); npm is now the intended package-manager path.
5. Fixed `src/start.ts` error middleware so thrown `Response` objects (including RBAC 401/403 responses) are preserved instead of being converted into a 500 page.
6. Changed unauthenticated paths in `src/integrations/supabase/auth-middleware.ts` to return HTTP 401 `Response` objects instead of generic errors that become 500 responses.

## Static verification performed

- ZIP integrity: passed.
- TypeScript/TSX transpile/syntax scan: 0 syntax errors across the source tree.
- Python bytecode/AST compilation: passed.
- Local import-resolution scan: no missing local source imports found (the only special case was the intentional CSS `?url` import).
- Route-tree coverage: all route source files are represented in `routeTree.gen.ts`.
- Database RPC name scan: all RPC names referenced by application code were found in the supplied SQL sources.
- Legacy backend URL scan: no remaining references in the audit copy.
- Deprecated `.inputValidator(...)`: 0 remaining.
- Bun/Lovable build artifacts: removed.

## Important production issues still requiring architectural work

### A. Background workers

`backend/app/outbox_worker.py` contains a permanent `while True` worker loop.
`backend/app/workflows.py` also contains worker-style continuous processing.

These are not appropriate as ordinary request handlers. They need a durable worker/queue runtime, Vercel-compatible scheduled processing, or another persistent execution service.

### B. Redis

The backend defaults to `redis://localhost:6379/0` and the rate limiter fails open if Redis is unavailable. Production should use an external Redis service and a deliberate failure policy.

### C. WebSocket architecture

`backend/app/main.py` exposes `/ws/chat/{conversation_id}`. Current Vercel WebSocket support is a newer Fluid Compute capability and durable cross-instance state requires external coordination such as Redis. The current Python WebSocket path should be tested specifically against the actual backend Vercel runtime rather than assumed equivalent to local Uvicorn.

### D. WebSocket authorization/persistence

The WebSocket handler validates the widget token and automation relationship, but unlike `/v1/widget/chat`, it does not currently perform the same subscription-active check and does not persist the exchanged messages/outbox events. This needs an intentional decision before production use.

### E. Server/client boundary

The project has many `*.functions.ts` modules imported from client code while containing static imports of `*.server.ts` modules. TanStack Start documents server-function wrappers as safe to import from client code, but the current build previously hit import-protection on this graph. The final npm/Vite build must be run after the syntax fixes to determine whether any remaining boundary violations exist.

### F. Environment examples

The real secrets are excluded from this audit ZIP, as intended. Deployment environment variables must remain configured in Vercel rather than committed.

## Security/version note

The lockfile resolves `@tanstack/react-start` to 1.168.60 and `@tanstack/start-server-core` to 1.169.39, which are the patched versions identified in TanStack's September 2026 security advisory.

## Build limitation

A complete `npm run build` was not reproduced inside this audit sandbox because the uploaded archive intentionally excludes `node_modules`. The source tree was nevertheless syntax-checked independently. The next authoritative build should be performed with `npm ci` and `npm run build` in Termux/Vercel using the patched copy.
