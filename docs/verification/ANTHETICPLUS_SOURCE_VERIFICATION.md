# AntheticPlus Studios source verification

Reviewed the uploaded project ZIP and applied the requested independent cleanup + homepage AI Voice Agent implementation.

## What was verified from the uploaded ZIP

The source contains the previously claimed Phase 1 / Phase 2 fixes and the Vercel lifecycle setup:

- `docs/database-bootstrap/migrations/2026-10-02_db1_audit_logs_gen2.sql` — additive `audit_logs` fields including `actor_user_id`, with `actor_id` preserved.
- `docs/database-bootstrap/migrations/2026-10-02_db2_orders_total_amount.sql` — guarded `orders.amount` -> `orders.total_amount` alignment.
- Admin CRM has the required `useQuery` import and query usage.
- Verification queue reads orders through the admin server-side data path and handles the empty state.
- Automations index uses the server-side installation/list data path and handles an empty installation set.
- Automation Creator preserves the post-deploy snippet and empty-state message.
- Subscription Lifecycle has the manual lifecycle control and the production lifecycle HTTP endpoint exists.
- Receptionist and other Phase 2 fixes are present in source.
- `vercel.json` configures `/api/public/hooks/lifecycle` on `0 6 * * *`.
- The lifecycle endpoint supports both GET and POST and uses `Authorization: Bearer <CRON_SECRET>` validation through `src/integrations/supabase/cron-auth.ts`.

## Important discrepancy found

The uploaded ZIP did **not** contain the earlier platform-role/auth fix that had been discussed as completed. The uploaded version still derived the primary role from organization membership and did not expose the union of global DB1 roles.

That missing fix was applied independently:

- DB1 global roles now take precedence over membership role when determining the primary role.
- `owner` / `admin` are treated as super-admin roles.
- `partner` remains a platform-admin role.
- `verifier` remains staff-only.
- The role list is exposed to the portal hook so the UI cannot accidentally collapse `admin` into `owner`.
- `/admin` now accepts `admin` directly and has an explicit error/retry state instead of silently bouncing on role-query failure.
- Admin navigation includes the new AI Voice Agent control for owner/admin/partner.

This preserves backend RBAC/RLS as the real security boundary.

## Homepage AI Voice Agent implemented

The homepage static receptionist area is now the live `VoiceAgent` component using the supplied Magic Marble / Originkit Three.js visual.

Capabilities implemented:

- One-click Start / Stop.
- Browser-native microphone permission and speech recognition.
- Animated microphone-level response for the marble.
- Listening / Thinking / Speaking / Muted / Stopped / Timeout / Error states.
- Browser speech synthesis for replies.
- Text-input fallback when voice is unavailable.
- Mute / unmute without leaving text chat.
- Automatic stop after the configured inactivity window (default 60 seconds); assistant TTS does not count as user activity.
- Public knowledge + live listed pricing from DB2.
- Editable administrator context, system instructions and announcements.
- Authenticated account context only for the currently signed-in user/client.
- No browser-supplied client ID is accepted for private account lookups.
- Account data exposed to the model is an explicit non-sensitive whitelist: company name, domain/category, subscription status and renewal/end dates, automation status/domain, pending verification, installation verification and recent order status/domain.
- Internal identifiers are not included in the model-facing account context.

## Email capability

A server-side email channel is included and controlled from `/admin/voice-agent`.

- Owner-only provider/secret configuration.
- Resend support.
- Sender/reply-to controls.
- Editable templates for renewal, verification, order confirmation, automation status, account summary, account update and announcement.
- Email destination is resolved from the signed-in account server-side; the browser cannot provide an arbitrary recipient.
- Default behavior requires confirmation before the assistant sends an email.
- The server function requires an explicit confirmation value and re-resolves the signed-in account before sending.
- Email sending is disabled when authenticated account context is disabled.
- A server-only helper exists for future event-driven account notifications without accepting a browser-supplied recipient.

No bulk/broadcast sender was added; announcements through the homepage assistant remain account-scoped and controlled.

## AI provider / secret handling

- The homepage assistant uses only the dedicated DB3 Groq key labeled `Homepage Voice Agent` through the existing canonical LLM router.
- The Groq secret remains server-side and encrypted at rest using the project's existing envelope encryption.
- The assistant does not call Groq directly from browser code.
- The LLM router now supports provider + label + model targeting while preserving existing request logging/cooldown behavior.
- No Groq secret is bundled into the client.

## Lovable independence cleanup

Removed from active runtime/dependency paths:

- `.lovable/` project files.
- Direct `@lovable.dev/vite-tanstack-config` dependency.
- Lovable-specific Vite config.
- Lovable-specific runtime error-reporting references.
- The obsolete Bun lockfile and Bun/Lovable build metadata were removed; npm is the active package-manager path.
- Package metadata was renamed to `antheticplus-studios`.

Historical `docs/legacy-single-db/*` migrations may still mention the old provider name; those are archived historical records, not active runtime dependencies.

## Safety / architecture preserved

No new database architecture was introduced.

The implementation continues to use:

- DB1 for auth/organization/control-plane settings.
- DB2 for orders/catalog/subscriptions/verification data.
- DB3 for AI provider keys/request logging.
- DB4 for the client-platform data already owned there.
- Existing Supabase authentication and tenant resolution.
- Existing backend RBAC/RLS checks.
- Existing lifecycle/cron path and security gate.

No Lovable Cloud capability was enabled.

## Verification performed in this environment

- Uploaded ZIP integrity check: PASS.
- Parsed all 183 TypeScript/TSX source files with the TypeScript parser: PASS, 0 syntax diagnostics.
- `package.json`, `vercel.json` and `tsconfig.json` JSON parse: PASS.
- Source scan for active Lovable references outside archived legacy history: none.
- Source scan for obvious hardcoded secret/connection-string patterns outside environment files: none found.
- The uploaded `.env` was excluded from the independent working copy/final ZIP so real environment secrets are not redistributed.

A full `npm install` was attempted for a real build/typecheck in this sandbox but timed out before dependencies were installed. Therefore a fresh `vite build` / full dependency-backed TypeScript check was **not** independently rerun here. The source is syntax-valid, and the previously reported Lovable preview build/typecheck results remain claims from the earlier preview run rather than independently reproduced results from this ZIP.

## Live database status limitation

A source ZIP cannot prove that the two DB migrations have already been executed against your live Supabase projects. The migration files and all current code references are aligned with the Gen 2 schema, but live application of those SQL migrations still requires querying the actual DBs (or seeing their migration history).
