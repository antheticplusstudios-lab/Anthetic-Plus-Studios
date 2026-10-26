# AntheticPlus Studios — Production Configuration Recovery

This runbook separates code fixes from deployment-secret configuration. Never commit a real `.env` file or place a Supabase service-role/secret key in any `VITE_*` variable.

## Supabase project verification

The connected Supabase accounts previously exposed the four expected production projects:

| App database | Supabase project | Project ref | Region |
|---|---|---|---|
| DB1 / `app_auth` | `antheticplus-auth-prod` | `dedmsffcvpchzywiggmg` | Tokyo (`ap-northeast-1`) |
| DB2 / `app_billing` | `antheticplus-billing-prod` | `zecusgollvmtzufzmehv` | Tokyo (`ap-northeast-1`) |
| DB3 / `app_ai` | `antheticplus-ai-prod` | `lktejvslktfazbqitoaq` | Mumbai (`ap-south-1`) |
| DB4 / `app_crm` | `antheticplus-crm-prod` | `iztbylxqvvrhsyislqlk` | Tokyo (`ap-northeast-1`) |

The DB4 project already existed and had the CRM/workflow schema when inspected. Do not create a duplicate project or blindly rerun bootstrap SQL. Project/schema existence does not prove the deployed app has correct environment variables or that every worker has been exercised end-to-end.

## Required server-side environment variables

Configure these in the hosting platform's server/build environment according to its environment-variable model:

- `DB1_URL`, `DB1_SERVICE_KEY`, `DB1_ANON_KEY`
- `DB2_URL`, `DB2_SERVICE_KEY`
- `DB3_URL`, `DB3_SERVICE_KEY`, `ANTHETICPLUS_DB3_MASTER_KEY`
- `DB4_URL`, `DB4_SERVICE_KEY`

Retrieve service-role/secret keys from the matching Supabase project dashboard. Keep them server-only. Never paste them into chat, source code, issues, or `VITE_*` variables.

## Client-side DB1 auth configuration

The browser requires the DB1 URL and a **public anon/publishable key**. Vite now resolves them at build time in this order:

1. `VITE_DB1_URL` / `VITE_DB1_ANON_KEY` when explicitly supplied.
2. Otherwise `DB1_URL` for the URL and `DB1_PUBLISHABLE_KEY` for the key if present.
3. Otherwise `DB1_ANON_KEY` for the public key.

Only the selected public values are injected into browser constants. The resolver refuses recognizable Supabase secret/service-role keys, including legacy JWTs whose role is `service_role`. Server variables such as `DB1_SERVICE_KEY`, `DB2_SERVICE_KEY`, `DB3_SERVICE_KEY`, and `DB4_SERVICE_KEY` are never mapped to client constants.

For deployments where build-time and server runtime variables are separate, set `VITE_DB1_URL` and `VITE_DB1_ANON_KEY` explicitly in the **build environment**. Rebuild/redeploy after changing them because Vite statically replaces client environment variables during the build.

## DB4 setup checklist

1. Add `DB4_URL` and `DB4_SERVICE_KEY` to the deployed application and worker server environments.
2. Keep those variables out of browser builds and public environment settings.
3. Rebuild/restart the application and worker so the new environment is loaded.
4. Test a read-only DB4 health/connectivity check.
5. Test the worker queue in a non-production or controlled path before enabling scheduled processing.
6. Verify webhook authentication, idempotency, retries, and tenant isolation.
7. Inspect worker logs for missing-variable, RPC, and schema errors. Never log keys or full authorization headers.

## Authentication verification checklist

After configuring build-time variables and rebuilding:

1. Confirm the generated client bundle targets the intended DB1 project URL.
2. Test sign-up/sign-in, Magic Link, password reset, OAuth callback, and sign-out.
3. Confirm signed-out users are redirected to `/auth?mode=signin` when opening protected pages.
4. Confirm authenticated users can load their own customer workspace.
5. Confirm server-side tenant authorization still checks verified identity and active organization membership.

Do not bypass the auth guard or create a fake session to make these checks pass.

## Payment gateway note

The existing checkout architecture supports manual remittance verification. Stripe/Paddle credentials are optional until automated payments are deliberately enabled. Do not present automated payment as available unless its secrets, webhook signature verification, idempotency, and subscription activation flow are configured and tested.

## Environment verification without secret disclosure

Check only whether a variable is present and valid enough for its intended role. Log variable names and success/failure states, not values, lengths, JWTs, or service-role keys. A successful build does not prove that production runtime secrets are present.
