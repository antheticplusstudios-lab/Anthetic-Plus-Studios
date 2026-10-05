# AntheticPlus four-database SQL bootstrap

These scripts target **four independent Supabase projects/Postgres databases**.

| File | Run in | Purpose |
|---|---|---|
| `01_db1_app_auth.sql` | DB1 `app_auth` | Auth, organizations/client IDs, roles, restrictions, staff, audit, flags/settings, outbox |
| `02_db2_app_billing.sql` | DB2 `app_billing` | Orders, payments, subscriptions, automations, installations, scripts, widget config, usage, health |
| `03_db3_app_ai.sql` | DB3 `app_ai` | AI config, providers/keys, RAG, pgvector/HNSW, semantic cache, evaluations |
| `04_db4_app_crm.sql` | DB4 `app_crm` | CRM, conversations, leads, Round-Robin, workflows, schedules/webhooks, execution history |
| `05_db1_bootstrap_first_owner.sql` | DB1 `app_auth` | Bootstrap the first real Auth user as platform owner |
| `07_db1_verify.sql` | DB1 `app_auth` | Verification checks |
| `08_db2_verify.sql` | DB2 `app_billing` | Verification checks |
| `09_db3_verify.sql` | DB3 `app_ai` | Verification checks |
| `10_db4_verify.sql` | DB4 `app_crm` | Verification checks |

There are no cross-database foreign keys. The canonical `client_id` is the DB1 `organizations.id` UUID.

**Do not run these files in the old single Supabase project.** Legacy single-database migrations are archived under `docs/legacy-single-db/` and are not part of the production bootstrap.
