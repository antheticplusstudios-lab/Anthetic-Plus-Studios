# Authentication and Authorization Architecture

This document describes the authentication paths currently used by AntheticPlus. Authentication proves who a caller is; authorization separately decides which tenant, role, and resource that caller may access.

## Components

| Component | Responsibility |
| --- | --- |
| `src/routes/auth.tsx` | Sign-in UI |
| `src/routes/auth.callback.tsx` | Handles the authentication callback and resulting session |
| `src/integrations/supabase/client.ts` | Browser Supabase client, configured from `VITE_DB1_URL` and `VITE_DB1_ANON_KEY` |
| `src/integrations/supabase/auth-attacher.ts` | Attaches the current session access token to authenticated server-function requests |
| `src/start.ts` | Registers application-wide request middleware, including authentication-token attachment and CSRF handling |
| `src/integrations/supabase/auth-middleware.ts` | Validates bearer tokens and builds server-side authentication context |
| `src/routes/_authenticated/route.tsx` | Protects authenticated UI routes and redirects unauthenticated users to `/auth` |
| `src/server/auth/tenant.server.ts` | Resolves tenant membership and tenant-scoped access context |
| `src/lib/rbac.server.ts` | Server-side staff, admin, owner, and active-tenant assertions |
| `src/server/db/clients.server.ts` | Server-only database clients for the configured DB1–DB4 connections |
| `src/server/security/envelope.server.ts` | Encrypts and decrypts provider secrets using AES-256-GCM |
| `src/lib/llm-router.server.ts` | Resolves provider credentials server-side and routes model requests |
| `backend/app/security.py`, `backend/app/supabase.py` | FastAPI bearer-token validation and backend authorization helpers |

These are distinct layers. A protected page is not a substitute for server-side authorization on the functions and endpoints that page calls.

## Request flows

### Browser sign-in and authenticated server functions

1. The browser uses the Supabase client configured with `VITE_DB1_URL` and `VITE_DB1_ANON_KEY`. The anon key is a public client identifier, not a service-role secret.
2. Supabase Auth establishes a user session. The client is configured to persist the session, refresh tokens, and detect sessions in the callback URL.
3. For server-function requests, `src/integrations/supabase/auth-attacher.ts` reads the current session and attaches its access token as `Authorization: Bearer <token>`.
4. `src/integrations/supabase/auth-middleware.ts` extracts the bearer token and validates its claims with Supabase Auth. Invalid or missing credentials are rejected on protected paths.
5. Server-side tenant resolution determines the caller's tenant context. Authorization helpers in `src/lib/rbac.server.ts` enforce the required staff/admin/owner role and tenant-active checks where used.
6. The function performs its operation only after its authentication and authorization requirements have been satisfied.

The authenticated route guard in `src/routes/_authenticated/route.tsx` also checks the signed-in user and redirects unauthenticated browser navigation to `/auth`. This is a user-experience guard; the server must still protect every privileged operation.

### Assistant entry points

The assistant has both authenticated and guest entry points:

- `src/lib/assistant-agent.functions.ts` contains `askAssistantGuest` and `askAssistantUser`. The user path is protected by `requireSupabaseAuth` and receives authenticated context; the guest path runs without a signed-in user context.
- `src/routes/api/public/assistant/chat.ts` accepts guest chat requests, validates input, checks site/origin permissions, and calls the assistant with guest context. Guest tool access must remain narrower than authenticated access.
- `src/routes/api/public/assistant/tts.ts` validates the site and applies rate limiting before serving text-to-speech requests.
- Assistant actions that require a user decision should use the authenticated confirmation path. The UI should not claim an action succeeded until the server-side operation confirms success.

Because public assistant routes intentionally accept unauthenticated callers, site/origin checks and rate limits are abuse controls, not proof of user identity. Any tool or mutation that can affect private data must independently require the appropriate authenticated context and authorization.

### FastAPI backend

The Python backend has a separate request-authentication path:

1. A client supplies a Supabase access token as a bearer token.
2. The security helpers in `backend/app/security.py` and `backend/app/supabase.py` validate the token with Supabase Auth.
3. Backend handlers apply the relevant tenant, role, and resource-ownership checks before returning or changing protected data.

Do not assume TanStack server-function middleware automatically protects FastAPI routes. Each backend route must use the backend's own dependencies and authorization checks.

## Credentials and tokens

| Item | Intended handling |
| --- | --- |
| `VITE_DB1_URL` | Browser-visible Supabase project URL |
| `VITE_DB1_ANON_KEY` | Browser-visible Supabase anon key; rely on correct RLS and server authorization, never treat it as a privileged secret |
| Supabase access token | Sent as a bearer token to protected server functions and validated server-side; do not log or expose it unnecessarily |
| DB1–DB4 service credentials | Server-side only; never prefix privileged credentials with `VITE_` or ship them to the browser |
| Provider API keys stored in DB3 | Decrypted on the server by the provider-routing code when needed; do not return them to clients or include them in logs |
| `ANTHETICPLUS_DB3_MASTER_KEY` | Server-side encryption key for provider-secret envelope encryption; decoded key material must be 32 bytes for AES-256-GCM |
| Encryption IV and authentication tag | AES-GCM uses a fresh 12-byte IV and an authentication tag; store the data needed to decrypt alongside the ciphertext, but never reuse IVs with the same key |
| Inworld/TTS provider credentials | Server-side only; browser requests should call the application's TTS endpoint rather than receive provider credentials |

Keep production secrets in the hosting platform's server-side environment configuration. Do not commit real values to source control, include them in client bundles, or paste them into issue reports. Rotate any credential that may have been exposed.

## Security review checklist

- [ ] Verify every privileged server function uses the correct authentication middleware and role/tenant assertions.
- [ ] Verify each FastAPI route that accesses protected data applies its own token validation and resource authorization.
- [ ] Review database Row Level Security policies, especially any operation performed with service-role clients that can bypass RLS.
- [ ] Ensure tenant IDs supplied by a client are checked against the authenticated user's membership rather than trusted as-is.
- [ ] Test missing, malformed, expired, and revoked tokens, plus disabled users and inactive tenants.
- [ ] Test guest chat/TTS rate limits and origin/site validation, including forwarded-IP behavior behind the production proxy.
- [ ] Keep provider secrets and access tokens out of logs, error responses, analytics, and client-visible payloads.
- [ ] Verify that assistant tools and mutations require explicit authorization and confirmation where appropriate.
- [ ] Keep auth-related tests for both success and denial cases; a successful sign-in test alone does not establish authorization correctness.
- [ ] Re-run the test suite, typecheck, and production build after authentication changes.

## Related implementation files

- [Supabase browser client](../src/integrations/supabase/client.ts)
- [Token attachment](../src/integrations/supabase/auth-attacher.ts)
- [Authentication middleware](../src/integrations/supabase/auth-middleware.ts)
- [Authenticated route guard](../src/routes/_authenticated/route.tsx)
- [OAuth callback](../src/routes/auth.callback.tsx)
- [Tenant resolution](../src/server/auth/tenant.server.ts)
- [RBAC helpers](../src/lib/rbac.server.ts)
- [Server database clients](../src/server/db/clients.server.ts)
- [Secret envelope encryption](../src/server/security/envelope.server.ts)
- [LLM provider routing](../src/lib/llm-router.server.ts)
- [Assistant functions](../src/lib/assistant-agent.functions.ts)
- [Public assistant chat endpoint](../src/routes/api/public/assistant/chat.ts)
- [Public assistant TTS endpoint](../src/routes/api/public/assistant/tts.ts)
- [FastAPI security](../backend/app/security.py)
- [FastAPI Supabase integration](../backend/app/supabase.py)

This document is an architecture guide, not a substitute for reviewing each route and database policy. Update it when the authentication middleware, tenant model, credential storage, or public endpoints change.
