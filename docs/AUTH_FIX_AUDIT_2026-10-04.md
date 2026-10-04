# Authentication Fix Audit — 2026-10-04

## Findings

1. The previous OAuth implementation passed `window.location.origin` directly to Supabase.
2. The source did not contain a hard-coded `localhost:3000`, so a production redirect to localhost is consistent with Supabase Auth URL configuration still using localhost or an environment/configuration mismatch.
3. Discord OAuth was not implemented in the authentication dialog.
4. There was no `/auth/callback` application route.

## Changes

- Added a canonical OAuth redirect helper using `VITE_APP_URL`, with browser-origin fallback for local development.
- Google OAuth now redirects to `/auth/callback`.
- Added Discord OAuth through Supabase.
- Added `/auth/callback` session completion route.
- Updated the generated route tree so the callback route is known immediately.
- Updated the environment example to the production Vercel URL.
- Added production authentication setup documentation.
- Hardened post-email-auth redirects so external redirect URLs cannot be used as an open redirect.
- Preserved the existing database-backed owner/admin authorization model.

## Required deployment configuration

Vercel Production:

```text
VITE_APP_URL=https://anthetic-plus-studios.vercel.app
```

Supabase DB1 Authentication → URL Configuration:

```text
Site URL:
https://anthetic-plus-studios.vercel.app

Redirect URL:
https://anthetic-plus-studios.vercel.app/auth/callback
```

Provider consoles must continue to use the Supabase Auth callback URL displayed by the provider configuration.

## Verification

- No `localhost:3000` reference remains in the production authentication code; local-development documentation may still mention localhost.
- Google and Discord both use `signInWithOAuth`.
- Callback route is present and included in `src/routeTree.gen.ts`.
- TypeScript syntax check reached dependency/type-definition resolution; a complete typecheck could not run because the uploaded source contains no `node_modules` and dependency installation timed out in the isolated environment.
