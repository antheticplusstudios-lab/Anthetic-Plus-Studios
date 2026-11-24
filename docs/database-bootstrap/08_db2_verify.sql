DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO missing
  FROM unnest(ARRAY['orders','payment_verifications','subscriptions','client_automations','automation_installations','script_generations','automation_tasks','integration_connections','usage_events','usage_meters','automation_health','outbox_events','processed_events']) x
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name=x);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'DB2 missing tables: %', missing; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='resolve_widget_installation') THEN RAISE EXCEPTION 'DB2 missing widget resolver'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='run_subscription_lifecycle') THEN RAISE EXCEPTION 'DB2 missing lifecycle function'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_health' AND column_name='overall' AND data_type='text') THEN RAISE EXCEPTION 'DB2 automation_health.overall must be text'; END IF;
END $$;
SELECT 'DB2 OK' AS verification, count(*) FILTER (WHERE relrowsecurity) AS rls_enabled_tables
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';
