-- BEHAVIORAL INTEGRATION CHECK. Run only on a disposable PostgreSQL staging database
-- after applying the fencing migration. Entire test is rolled back.
BEGIN;
DO $test$
DECLARE
  v_id uuid;
  v_old_token text;
  v_old_at timestamptz;
  v_new_token text := gen_random_uuid()::text;
  v_result boolean;
  v_status text;
  v_token text;
BEGIN
  INSERT INTO public.outbox_events(event_type, aggregate_type, aggregate_id, idempotency_key, payload, status, next_attempt_at, created_at)
  VALUES ('security.fencing.test', 'test', gen_random_uuid(), 'v6-fencing-' || gen_random_uuid()::text,
          '{}'::jsonb, 'pending', now(), 'epoch'::timestamptz)
  RETURNING id INTO v_id;

  SELECT claim_token, locked_at INTO v_old_token, v_old_at
  FROM public.claim_outbox_events('v6-reused-worker', 100)
  WHERE id = v_id;
  IF v_old_token IS NULL OR v_old_at IS NULL THEN
    RAISE EXCEPTION 'Initial claim did not return a token/timestamp';
  END IF;

  -- Simulate reclamation by the SAME worker ID but a fresh claim token.
  UPDATE public.outbox_events
  SET status='processing', locked_by='v6-reused-worker', locked_at=clock_timestamp(), claim_token=v_new_token
  WHERE id=v_id;

  v_result := public.complete_outbox_event(v_id, 'v6-reused-worker', v_old_token, v_old_at);
  IF v_result IS DISTINCT FROM false THEN RAISE EXCEPTION 'Stale completion was not rejected'; END IF;
  v_result := public.fail_outbox_event(v_id, 'v6-reused-worker', 'stale test', now(), true, v_old_token, v_old_at);
  IF v_result IS DISTINCT FROM false THEN RAISE EXCEPTION 'Stale failure was not rejected'; END IF;

  SELECT status::text, claim_token INTO v_status, v_token FROM public.outbox_events WHERE id=v_id;
  IF v_status <> 'processing' OR v_token <> v_new_token THEN
    RAISE EXCEPTION 'Stale RPC modified the current claim';
  END IF;
  RAISE NOTICE 'PASS: stale complete/fail rejected even when worker ID is reused';
END
$test$;
ROLLBACK;
