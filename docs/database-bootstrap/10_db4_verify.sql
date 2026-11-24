DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO missing
  FROM unnest(ARRAY['crm_clients','conversations','messages','leads','appointments','round_robin_teams','round_robin_members','round_robin_rules','round_robin_assignments','round_robin_state','workflow_definitions','workflow_steps','workflow_schedules','workflow_webhooks','workflow_runs','workflow_run_steps','outbox_events','processed_events']) x
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name=x);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'DB4 missing tables: %', missing; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='assign_round_robin') THEN RAISE EXCEPTION 'DB4 Round-Robin function is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_runs' AND column_name='resume_at') THEN RAISE EXCEPTION 'DB4 workflow_runs.resume_at is missing'; END IF;
END $$;
SELECT 'DB4 OK' AS verification, count(*) FILTER (WHERE relrowsecurity) AS rls_enabled_tables
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';
