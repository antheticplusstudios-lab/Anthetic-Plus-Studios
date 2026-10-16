# Outbox claim fencing — V6

## Scope and status
The migration `migrations/2026-10-09_db_outbox_claim_fencing.sql` must be run independently on **each** of DB1, DB2, DB3 and DB4. It has not been applied by this archive build. Do not run it against production before staging verification and a backup.

The migration adds `outbox_events.claim_token`, creates a new unpredictable UUID token for each claim, removes the legacy completion/failure RPC signatures, and requires event ID + `processing` status + worker ID + token + claim timestamp for completion/failure. The RPCs return `boolean` (`true` only when exactly one row was updated). EXECUTE is revoked from PUBLIC/anon/authenticated and granted to `service_role` where that role exists. `gen_random_uuid()` is provided by PostgreSQL 13+; no extension is required for this migration.

## Migration order
1. Take a restorable snapshot of each target database.
2. Apply the migration to a disposable/staging DB1, DB2, DB3 and DB4 separately.
3. Run `OUTBOX_CLAIM_FENCING_VERIFY.sql` in each database.
4. Run the backend tests and real PostgreSQL integration tests in staging (the fake unit tests are not a substitute).
5. Deploy the matching V6 worker only after all four databases expose the new RPC signatures. Old worker code calls obsolete RPC signatures and will fail closed after the old signatures are dropped.
6. Repeat migration, verification and worker rollout one database at a time during a controlled maintenance window. Do not mix old worker code with new RPC signatures.

## Verification SQL
Run `OUTBOX_CLAIM_FENCING_VERIFY.sql`. On a disposable staging database, also run `OUTBOX_CLAIM_FENCING_BEHAVIOR.sql` (transactional test that rolls back). Confirm the `claim_token` column exists; the old two-argument completion RPC and old five-argument failure RPC are absent; the new completion/failure functions return boolean; and only intended service roles can execute them.

For an actual behavioral test, use a disposable PostgreSQL database and the supplied integration SQL/test harness. Do not test by modifying production rows.

## Rollback procedure and limits
Rollback is deliberately **not** an automatic down-migration. Once V6 workers run, old worker binaries cannot use the new signatures. If rollback is required:
1. Stop all workers.
2. Restore a pre-migration database snapshot where possible (preferred), or deploy a reviewed reverse migration that recreates the old RPC signatures and removes `claim_token` only after confirming no V6 worker can call it.
3. Roll back application code only after database compatibility is restored.
4. Restart one worker and monitor outbox backlog and errors.

A reverse migration that restores the unsafe `locked_by IS NULL` escape hatch reintroduces the original vulnerability. Do not restore that predicate. Dropping `claim_token` loses claim history and must not be done while any V6 worker is active. Snapshot restore can discard writes made after the snapshot; reconcile those writes before using it.

## Free-trial index remains optional
The existing optional migration `2026-10-09_OPTIONAL_outbox_hardening.sql` combines a free-trial uniqueness index with earlier lease-holder RPCs. Do not apply it as part of V6; its RPC definitions are superseded by the fencing migration. Before considering the index, run:

```sql
SELECT client_id, count(*)
FROM public.subscriptions
WHERE plan_code = 'free-trial'
GROUP BY client_id
HAVING count(*) > 1;
```

Resolve duplicates according to business policy and verify foreign keys/retention before adding a unique partial index. The source archive alone cannot establish whether live/staging data has duplicates, and no live database was queried for this release. The reported index issue is therefore **not reproducible from source alone**.

## Other database setup notes
Review `docs/database-bootstrap/README.md` and each bootstrap's actual schema before deployment. The V6 fencing migration requires PostgreSQL 13+ for core `gen_random_uuid()` and does not install extensions. Other application schema requirements, including vector support if the DB3 schema uses `vector`, remain governed by the existing bootstrap script and should be verified against the target database's installed extensions.
