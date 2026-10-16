DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO missing
  FROM unnest(ARRAY['profiles','organizations','organization_members','user_roles','account_restrictions','staff_permissions','audit_logs','outbox_events','processed_events']) x
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name=x);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'DB1 missing tables: %', missing; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='handle_new_user') THEN RAISE EXCEPTION 'DB1 missing auth trigger function'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='claim_outbox_events') THEN RAISE EXCEPTION 'DB1 missing outbox claim function'; END IF;
END $$;
SELECT 'DB1 OK' AS verification, count(*) FILTER (WHERE relrowsecurity) AS rls_enabled_tables
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';
