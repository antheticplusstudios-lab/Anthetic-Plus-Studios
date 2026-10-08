-- Verification. Runs inside a transaction and ROLLS BACK, so no test rows remain.
-- Capture row counts BEFORE applying the migrations and compare with section 0 output.

-- ===== DB2 (run against DB2) =====
-- 0. Row counts
-- SELECT 'orders', count(*) FROM public.orders UNION ALL SELECT 'client_automations', count(*) FROM public.client_automations;
-- 1. Constraint accepts all six values
-- SELECT conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname IN ('orders_automation_type_check','client_automations_automation_type_check');
-- 2. Existing type distribution unchanged
-- SELECT automation_type, count(*) FROM public.client_automations GROUP BY 1 ORDER BY 1;

-- ===== DB4 (run against DB4) =====
BEGIN;
DO $$
DECLARE a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); e1 uuid; e2 uuid; created boolean;
  r public.automation_executions%ROWTYPE; n int; i int;
  t uuid; m1 uuid; m2 uuid; m3 uuid; x1 record; x2 record; x3 record; rr record;
BEGIN
  -- Idempotency
  SELECT execution_id, enqueue_automation_execution.created INTO e1, created FROM public.enqueue_automation_execution(a,c,'lead_capture','k1');
  ASSERT created, 'first enqueue should create';
  SELECT execution_id, enqueue_automation_execution.created INTO e2, created FROM public.enqueue_automation_execution(a,c,'lead_capture','k1');
  ASSERT NOT created AND e1=e2, 'duplicate enqueue must return same execution';
  RAISE NOTICE 'PASS idempotency';

  -- Webhook dedup
  INSERT INTO public.automation_events(provider,external_event_id,automation_id,payload_hash) VALUES ('twilio','evt-1',a,'h');
  BEGIN
    INSERT INTO public.automation_events(provider,external_event_id,automation_id,payload_hash) VALUES ('twilio','evt-1',a,'h');
    RAISE EXCEPTION 'FAIL dedup';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS webhook dedup'; END;

  -- Claim: second worker gets nothing while lease is held
  SELECT count(*) INTO n FROM public.claim_automation_executions('w1',10,60) WHERE id=e1;
  ASSERT n=1, 'w1 should claim';
  SELECT count(*) INTO n FROM public.claim_automation_executions('w2',10,60) WHERE id=e1;
  ASSERT n=0, 'w2 must not claim leased execution';
  RAISE NOTICE 'PASS claim exclusivity';

  -- Retry progression to exhaustion
  UPDATE public.automation_executions SET max_attempts=3 WHERE id=e1;
  FOR i IN 1..3 LOOP
    r := public.finish_automation_execution(e1,'w1','retryable','boom');
    IF i<3 THEN
      ASSERT r.status='retrying' AND r.next_attempt_at>now(), 'should be retrying with backoff';
      UPDATE public.automation_executions SET next_attempt_at=now()-interval '1s' WHERE id=e1;
      PERFORM public.claim_automation_executions('w1',10,60);
    END IF;
  END LOOP;
  ASSERT r.status='failed' AND r.attempt_count=3, 'exhaustion must become failed';
  SELECT count(*) INTO n FROM public.automation_execution_attempts WHERE execution_id=e1;
  ASSERT n=3, 'three attempts audited';
  RAISE NOTICE 'PASS retries + exhaustion';

  -- Lease expiry: an expired running lease is reclaimable by another worker
  SELECT execution_id INTO e2 FROM public.enqueue_automation_execution(a,c,'kb_support','k2');
  PERFORM public.claim_automation_executions('w1',10,60);
  UPDATE public.automation_executions SET locked_until=now()-interval '1s' WHERE id=e2;
  SELECT count(*) INTO n FROM public.claim_automation_executions('w2',10,60) WHERE id=e2;
  ASSERT n=1, 'expired lease must be reclaimable';
  BEGIN
    PERFORM public.finish_automation_execution(e2,'w1','succeeded');
    RAISE EXCEPTION 'FAIL stale worker finished';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS lease expiry + stale worker rejected';
  END;
  r := public.finish_automation_execution(e2,'w2','non_retryable','bad input');
  ASSERT r.status='failed' AND r.error_class='non_retryable', 'non-retryable fails immediately';
  RAISE NOTICE 'PASS non-retryable';

  -- Cancellation: cancel_requested executions are never claimed
  SELECT execution_id INTO e2 FROM public.enqueue_automation_execution(a,c,'messaging_ai','k3');
  UPDATE public.automation_executions SET cancel_requested=true WHERE id=e2;
  SELECT count(*) INTO n FROM public.claim_automation_executions('w1',10,60) WHERE id=e2;
  ASSERT n=0, 'cancelled must not be claimed';
  RAISE NOTICE 'PASS cancellation blocks claim';

  -- Round-robin rotation and skipping (temporary CRM client, rolled back)
  INSERT INTO public.crm_clients(id) VALUES (c);
  INSERT INTO public.round_robin_teams(client_id,name) VALUES (c,'verify-team') RETURNING id INTO t;
  INSERT INTO public.round_robin_members(team_id,external_assignee_key,created_at) VALUES (t,'m1',now()-interval '3s') RETURNING id INTO m1;
  INSERT INTO public.round_robin_members(team_id,external_assignee_key,created_at) VALUES (t,'m2',now()-interval '2s') RETURNING id INTO m2;
  INSERT INTO public.round_robin_members(team_id,external_assignee_key,availability_status,created_at) VALUES (t,'m3','offline',now()-interval '1s') RETURNING id INTO m3;
  SELECT * INTO x1 FROM public.assign_round_robin(t,'lead',gen_random_uuid());
  SELECT * INTO x2 FROM public.assign_round_robin(t,'lead',gen_random_uuid());
  SELECT * INTO x3 FROM public.assign_round_robin(t,'lead',gen_random_uuid());
  ASSERT x1.member_id=m1 AND x2.member_id=m2 AND x3.member_id=m1, 'rotation must advance persistently';
  ASSERT m3 NOT IN (x1.member_id,x2.member_id,x3.member_id), 'offline member skipped';
  ASSERT (SELECT m3 = ANY(skipped_member_ids) FROM public.round_robin_assignments WHERE id=x1.assignment_id), 'skip recorded';
  RAISE NOTICE 'PASS round-robin rotation + skip';

  SELECT * INTO rr FROM public.reassign_round_robin(x1.assignment_id,'verify');
  ASSERT rr.member_id IS NOT NULL AND (SELECT status FROM public.round_robin_assignments WHERE id=x1.assignment_id)='reassigned', 'reassign';
  RAISE NOTICE 'PASS reassignment';
END $$;
ROLLBACK;
