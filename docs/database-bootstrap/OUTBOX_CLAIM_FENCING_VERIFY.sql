-- Read-only catalog verification. Run separately in DB1, DB2, DB3 and DB4.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='outbox_events' AND column_name='claim_token'
  ) AS claim_token_column_present,
  to_regprocedure('public.complete_outbox_event(uuid,text)') IS NULL AS legacy_complete_signature_absent,
  to_regprocedure('public.fail_outbox_event(uuid,text,text,timestamp with time zone,boolean)') IS NULL AS legacy_fail_signature_absent,
  to_regprocedure('public.complete_outbox_event(uuid,text,text,timestamp with time zone)') IS NOT NULL AS fenced_complete_signature_present,
  to_regprocedure('public.fail_outbox_event(uuid,text,text,timestamp with time zone,boolean,text,timestamp with time zone)') IS NOT NULL AS fenced_fail_signature_present;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result, p.prosecdef AS security_definer,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_can_execute,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
            THEN has_function_privilege('anon', p.oid, 'EXECUTE') ELSE false END AS anon_can_execute,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
            THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') ELSE false END AS authenticated_can_execute,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
            THEN has_function_privilege('service_role', p.oid, 'EXECUTE') ELSE false END AS service_role_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('claim_outbox_events','complete_outbox_event','fail_outbox_event')
ORDER BY p.proname, arguments;
