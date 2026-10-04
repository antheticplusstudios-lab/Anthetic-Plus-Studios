# AntheticPlus Suite — Independent Audit & Hardening

Date: 2026-10-04

This audit was performed independently against `antheticplus-suite-audited.zip`. Claude's report was treated as a claim set, not as verification.

## Verification actually performed

- ZIP extracted successfully.
- 220 TypeScript/TSX source files transpiled with TypeScript 5.x using syntax diagnostics: **PASS, 0 diagnostics**.
- Python backend compiled with `py_compile`/`compileall`: **PASS**.
- Package-manager state: **NO LOCKFILE**. `npm ci` therefore cannot run until a lockfile is generated/committed. This is an archive defect, not merely a sandbox network limitation.
- Full dependency-aware typecheck/build/test/lint: **NOT VERIFIED** because the archive has no lockfile/node_modules.
- Live DB1–DB4: **NOT VERIFIED** from this environment.

## Additional findings beyond Claude's report

### P1 — Python backend tenant authorization trusted a user-writable profile field
`backend/app/security.py` selected `profiles.default_organization_id` and used it directly as `client_id` without checking `organization_members`. This was inconsistent with the hardened TypeScript tenant resolver and could permit cross-tenant access through backend endpoints.

**Fixed in this copy:** backend tenant resolution now requires an active organization membership and uses the preferred organization only when membership exists; otherwise it falls back to the first active membership.

### P1 — DB1 still allowed authenticated users to mutate tenant-binding profile fields
`profiles_update` permits users to update the entire profile row. `default_organization_id` and `client_id` are tenant-binding fields, while compatibility helpers also derive other tenant metadata from them.

**Fixed in this copy:** added `2026-10-04_db1_profile_tenant_guard.sql`, a BEFORE UPDATE trigger that prevents authenticated users from changing `client_id` and requires any changed default organization to be an active membership. The migration is **not applied to production**.

### P1 — WebSocket path was still not persistence/outbox-equivalent
Claude added subscription and rate-limit checks, but the WebSocket handler still only generated a response. It did not persist user/assistant messages or emit the same outbox events as the POST widget path.

**Fixed in this copy:** WebSocket now checks active conversation status, persists both sides of the exchange, emits `message.created` outbox events, updates `last_message_at`, and uses recent conversation history.

### P1 — Redis rate limiter still failed open
The backend returned `True` when Redis was unavailable, disabling a security control exactly when infrastructure was degraded.

**Fixed in this copy:** Redis failure now produces a service-unavailable condition rather than silently bypassing rate limiting.

### P2 — SSRF protection was incomplete and redirect-unsafe
The URL scraper blocked only a few string prefixes. It missed RFC1918 `172.16/12`, IPv6 local ranges, CGNAT and other special ranges, and `crawl()` followed redirects without validating redirect targets.

**Fixed in this copy:** added DNS-resolution-based public-host validation, IPv4/IPv6 special-range checks, manual redirect validation, and a redirect cap. Both knowledge scrapers now use the same validation helper.

## Important findings still unresolved

1. **No lockfile.** The project cannot be authoritative with `npm ci` until `package-lock.json` (or another supported lockfile) is committed.
2. **No dependency-aware build.** `typecheck`, `build`, tests and lint remain unverified.
3. **DB3 contract and live DB1–DB4 remain unverified.**
4. **Inbound automation webhook authentication still uses a global CRON secret.** Provider-specific signature verification and per-automation secrets are recommended.
5. **Assistant action confirmation has a replay race:** `alreadyExecuted()` is a read-then-write check. Two concurrent confirmations can both pass before either audit row is written. A DB-level atomic claim/idempotency primitive is required for a strict guarantee.
6. **Automation storefront/product scope is inconsistent.** The engine supports exactly four automation kinds, but ordering code still accepts legacy `ai_sales_agent` and `workflow_automation`; the catalog also labels them. Conversely, the current order UI exposes only two of the four intended automation products. This needs one authoritative product enum/catalog and matching DB validation.
7. **Python background workers contain permanent loops** and should not be assumed to run correctly as ordinary Vercel request handlers.
8. **WebSocket deployment/runtime still needs an actual production-runtime test.**
9. **Third-party marble assets are loaded from unpinned `@master` URLs.**

## Verdict

The audited ZIP is materially better than the pre-audit code and the claimed fixes for the main TypeScript tenant/RBAC and webhook issues are plausible and syntax-valid. However, it is **not yet production-verified**. The additional Python tenant flaw and WebSocket persistence gap found here are significant enough that the ZIP should not be deployed as-is without the hardening changes in this copy and subsequent dependency-aware + live-DB verification.
