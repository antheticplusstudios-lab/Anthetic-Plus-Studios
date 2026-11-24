# Legacy migration path disabled

The old single-Supabase-schema migrations are archived under `docs/legacy-single-db/drizzle/migrations/`.

This project now uses four separate Supabase projects/databases. Do **not** run the archived migrations against any production database. Use the final DB1/DB2/DB3/DB4 SQL package under `docs/database-bootstrap/` instead.

Active application migrations are managed through the dedicated four-database SQL contracts and application cutover code.
