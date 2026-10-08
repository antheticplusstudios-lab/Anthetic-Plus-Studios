-- DB4 (conversations/leads/executions/round-robin) — ADD-ONLY.
-- New: automation_executions, automation_events, automation_execution_attempts; claim/finish/enqueue functions;
-- fixed assign_round_robin (assigned_at, active-only reuse, skip tracking); new reassign_round_robin.
-- No DROP TABLE, TRUNCATE, DELETE or renames. Rollback steps at the bottom (commented).
BEGIN;

-- ---------- Executions ----------
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL,                         -- DB2 client_automations.id (cross-DB, no FK)
  client_id uuid NOT NULL,
  automation_kind text NOT NULL CHECK (automation_kind IN ('ai_receptionist','lead_capture','kb_support','messaging_ai')),
  trigger_type text NOT NULL DEFAULT 'event',
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','retrying','cancelled','paused','disabled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_class text CHECK (error_class IS NULL OR error_class IN ('retryable','non_retryable','timeout','cancelled')),
  last_error text,
  timeout_seconds integer NOT NULL DEFAULT 120 CHECK (timeout_seconds BETWEEN 1 AND 3600),
  locked_by text,
  locked_until timestamptz,
  cancel_requested boolean NOT NULL DEFAULT false,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_executions_idem_uniq UNIQUE (automation_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS automation_executions_queue_idx
  ON public.automation_executions (next_attempt_at) WHERE status IN ('queued','retrying');
CREATE INDEX IF NOT EXISTS automation_executions_lease_idx
  ON public.automation_executions (locked_until) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS automation_executions_history_idx
  ON public.automation_executions (automation_id, queued_at DESC);

CREATE TABLE IF NOT EXISTS public.automation_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  worker_id text,
  outcome text NOT NULL CHECK (outcome IN ('succeeded','retryable','non_retryable','timeout','cancelled')),
  error text,
  started_at timestamptz,
  finished_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (execution_id, attempt_number)
);

-- ---------- Inbound events / webhook dedup ----------
CREATE TABLE IF NOT EXISTS public.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  automation_id uuid NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','enqueued','ignored','failed')),
  execution_id uuid REFERENCES public.automation_executions(id) ON DELETE SET NULL,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_events_dedup_uniq UNIQUE (provider, external_event_id)
);
CREATE INDEX IF NOT EXISTS automation_events_automation_idx ON public.automation_events (automation_id, received_at DESC);

ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_executions, public.automation_execution_attempts, public.automation_events FROM anon, authenticated;
GRANT ALL ON public.automation_executions, public.automation_execution_attempts, public.automation_events TO service_role;

-- ---------- Round-robin / workflow additive columns ----------
ALTER TABLE public.round_robin_assignments ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.round_robin_assignments ADD COLUMN IF NOT EXISTS skipped_member_ids uuid[];
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS resume_at timestamptz;
-- One active assignment per subject. Created only if existing data already satisfies it (never deletes rows).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.round_robin_assignments WHERE status='assigned'
    GROUP BY team_id, subject_type, subject_id HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS rr_assignments_one_active_uniq
      ON public.round_robin_assignments (team_id, subject_type, subject_id) WHERE status='assigned';
  ELSE
    RAISE NOTICE 'rr_assignments_one_active_uniq skipped: existing duplicate active assignments need manual review';
  END IF;
END $$;

-- ---------- Enqueue (idempotent) ----------
CREATE OR REPLACE FUNCTION public.enqueue_automation_execution(
  p_automation_id uuid, p_client_id uuid, p_kind text, p_idempotency_key text,
  p_input jsonb DEFAULT '{}'::jsonb, p_trigger_type text DEFAULT 'event', p_max_attempts integer DEFAULT 5)
RETURNS TABLE(execution_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.automation_executions(automation_id,client_id,automation_kind,idempotency_key,input,trigger_type,max_attempts)
  VALUES (p_automation_id,p_client_id,p_kind,p_idempotency_key,COALESCE(p_input,'{}'::jsonb),p_trigger_type,p_max_attempts)
  ON CONFLICT (automation_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, true; RETURN; END IF;
  RETURN QUERY SELECT e.id, false FROM public.automation_executions e
    WHERE e.automation_id=p_automation_id AND e.idempotency_key=p_idempotency_key;
END $$;

-- ---------- Claim (concurrency-safe, with lease; expired leases are reclaimable) ----------
CREATE OR REPLACE FUNCTION public.claim_automation_executions(p_worker_id text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.automation_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT e.id FROM public.automation_executions e
    WHERE ((e.status IN ('queued','retrying') AND e.next_attempt_at <= now())
        OR (e.status = 'running' AND e.locked_until < now()))
      AND NOT e.cancel_requested
    ORDER BY e.next_attempt_at
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.automation_executions e
  SET status='running', locked_by=p_worker_id,
      locked_until=now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, e.timeout_seconds), 3600)),
      attempt_count=e.attempt_count+1, started_at=COALESCE(e.started_at, now()), updated_at=now()
  FROM picked WHERE e.id=picked.id
  RETURNING e.*;
END $$;

-- ---------- Finish (bounded exponential backoff + jitter; only the lease holder may finish) ----------
CREATE OR REPLACE FUNCTION public.finish_automation_execution(
  p_execution_id uuid, p_worker_id text, p_outcome text, p_error text DEFAULT NULL, p_result jsonb DEFAULT NULL)
RETURNS public.automation_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.automation_executions%ROWTYPE; v_delay numeric;
BEGIN
  IF p_outcome NOT IN ('succeeded','retryable','non_retryable','timeout','cancelled') THEN
    RAISE EXCEPTION 'invalid outcome %', p_outcome;
  END IF;
  SELECT * INTO v FROM public.automation_executions WHERE id=p_execution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution not found'; END IF;
  IF v.status <> 'running' OR v.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'execution % not leased by %', p_execution_id, p_worker_id;
  END IF;

  INSERT INTO public.automation_execution_attempts(execution_id,attempt_number,worker_id,outcome,error,started_at)
  VALUES (v.id, v.attempt_count, p_worker_id, p_outcome, left(p_error,4000), v.started_at)
  ON CONFLICT (execution_id, attempt_number) DO NOTHING;

  IF p_outcome='succeeded' THEN
    UPDATE public.automation_executions SET status='succeeded', result=p_result, error_class=NULL, last_error=NULL,
      locked_by=NULL, locked_until=NULL, finished_at=now(), updated_at=now() WHERE id=v.id RETURNING * INTO v;
  ELSIF p_outcome='cancelled' OR v.cancel_requested THEN
    UPDATE public.automation_executions SET status='cancelled', error_class='cancelled', last_error=left(p_error,4000),
      locked_by=NULL, locked_until=NULL, finished_at=now(), updated_at=now() WHERE id=v.id RETURNING * INTO v;
  ELSIF p_outcome IN ('retryable','timeout') AND v.attempt_count < v.max_attempts THEN
    v_delay := LEAST(power(2, v.attempt_count) * 30, 3600) + floor(random()*15);
    UPDATE public.automation_executions SET status='retrying', error_class=CASE WHEN p_outcome='timeout' THEN 'timeout' ELSE 'retryable' END,
      last_error=left(p_error,4000), next_attempt_at=now()+make_interval(secs => v_delay::double precision),
      locked_by=NULL, locked_until=NULL, updated_at=now() WHERE id=v.id RETURNING * INTO v;
  ELSE
    UPDATE public.automation_executions SET status='failed',
      error_class=CASE WHEN p_outcome='non_retryable' THEN 'non_retryable' WHEN p_outcome='timeout' THEN 'timeout' ELSE 'retryable' END,
      last_error=left(p_error,4000), locked_by=NULL, locked_until=NULL, finished_at=now(), updated_at=now()
      WHERE id=v.id RETURNING * INTO v;
  END IF;
  RETURN v;
END $$;

-- ---------- Round-robin (fixed) ----------
CREATE OR REPLACE FUNCTION public.assign_round_robin(
  p_team_id uuid, p_subject_type text, p_subject_id uuid,
  p_strategy public.assignment_strategy DEFAULT NULL, p_manual_member_id uuid DEFAULT NULL)
RETURNS TABLE(assignment_id uuid, member_id uuid, strategy public.assignment_strategy, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_team public.round_robin_teams%ROWTYPE;
  v_strategy public.assignment_strategy;
  v_member public.round_robin_members%ROWTYPE;
  v_state public.round_robin_state%ROWTYPE;
  v_assignment uuid; v_count integer; v_offset integer; v_skipped uuid[]; v_reason text;
BEGIN
  -- Team row lock serialises concurrent assignments for one team.
  SELECT * INTO v_team FROM public.round_robin_teams WHERE id=p_team_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round robin team not found or inactive'; END IF;
  v_strategy := COALESCE(p_strategy, v_team.assignment_strategy);

  -- Reuse only an ACTIVE assignment (fix: was ORDER BY created_at, a column that does not exist).
  SELECT a.id, a.member_id, v_strategy, a.status::text INTO assignment_id, member_id, strategy, status
  FROM public.round_robin_assignments a
  WHERE a.team_id=p_team_id AND a.subject_type=p_subject_type AND a.subject_id=p_subject_id AND a.status='assigned'
  ORDER BY a.assigned_at DESC LIMIT 1;
  IF assignment_id IS NOT NULL THEN RETURN NEXT; RETURN; END IF;

  INSERT INTO public.round_robin_state(team_id,next_index,version) VALUES(p_team_id,0,0) ON CONFLICT(team_id) DO NOTHING;
  SELECT * INTO v_state FROM public.round_robin_state WHERE team_id=p_team_id FOR UPDATE;

  SELECT array_agg(m.id) INTO v_skipped FROM public.round_robin_members m
  WHERE m.team_id=p_team_id AND NOT (m.is_active AND m.availability_status='available'
    AND (m.max_active IS NULL OR m.current_active<m.max_active)
    AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily));

  IF v_strategy='manual_override' THEN
    SELECT * INTO v_member FROM public.round_robin_members
    WHERE id=p_manual_member_id AND team_id=p_team_id AND is_active;
    v_reason := 'manual_override';
  ELSIF v_strategy='round_robin' THEN
    SELECT count(*) INTO v_count FROM public.round_robin_members m
    WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
      AND (m.max_active IS NULL OR m.current_active<m.max_active)
      AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily);
    IF v_count>0 THEN
      v_offset := v_state.next_index % v_count;   -- persistent rotation pointer
      SELECT m.* INTO v_member FROM (
        SELECT m.*, row_number() OVER (ORDER BY m.created_at, m.id)-1 AS rn
        FROM public.round_robin_members m
        WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
          AND (m.max_active IS NULL OR m.current_active<m.max_active)
          AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily)
      ) m WHERE m.rn=v_offset;
    END IF;
    v_reason := 'rotation';
  ELSE
    SELECT m.* INTO v_member FROM public.round_robin_members m
    WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
      AND (m.max_active IS NULL OR m.current_active<m.max_active)
      AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily)
    ORDER BY
      CASE WHEN v_strategy='priority' THEN m.priority END DESC NULLS LAST,
      CASE WHEN v_strategy='least_active' THEN m.current_active END ASC NULLS LAST,
      CASE WHEN v_strategy='least_assigned' THEN m.assigned_today END ASC NULLS LAST,
      CASE WHEN v_strategy='weighted' THEN m.weight END DESC NULLS LAST,
      m.priority DESC, m.assigned_today ASC, m.created_at ASC, m.id ASC
    LIMIT 1;
    v_reason := v_strategy::text;
  END IF;

  IF v_member.id IS NULL AND v_team.fallback_member_id IS NOT NULL THEN
    SELECT * INTO v_member FROM public.round_robin_members
    WHERE id=v_team.fallback_member_id AND team_id=p_team_id AND is_active;
    IF v_member.id IS NOT NULL THEN v_reason := 'fallback'; END IF;
  END IF;
  IF v_member.id IS NULL THEN v_reason := 'no_available_member'; END IF;

  INSERT INTO public.round_robin_assignments(team_id,member_id,subject_type,subject_id,status,strategy,metadata,reason,skipped_member_ids)
  VALUES(p_team_id, v_member.id, p_subject_type, p_subject_id,
         (CASE WHEN v_member.id IS NULL THEN 'released' ELSE 'assigned' END)::public.assignment_status,
         v_strategy, jsonb_build_object('overflow_behavior', v_team.overflow_behavior), v_reason, v_skipped)
  RETURNING id INTO v_assignment;

  IF v_member.id IS NOT NULL THEN
    UPDATE public.round_robin_members SET current_active=current_active+1, assigned_today=assigned_today+1, updated_at=now()
    WHERE id=v_member.id;
    UPDATE public.round_robin_state SET last_assigned_member_id=v_member.id,
      next_index=CASE WHEN v_reason='rotation' THEN next_index+1 ELSE next_index END,
      version=version+1, updated_at=now()
    WHERE team_id=p_team_id;
  END IF;

  RETURN QUERY SELECT v_assignment, v_member.id, v_strategy,
    CASE WHEN v_member.id IS NULL THEN 'unassigned' ELSE 'assigned' END;
END $$;

CREATE OR REPLACE FUNCTION public.reassign_round_robin(p_assignment_id uuid, p_reason text DEFAULT 'manual_reassign',
  p_manual_member_id uuid DEFAULT NULL)
RETURNS TABLE(assignment_id uuid, member_id uuid, strategy public.assignment_strategy, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.round_robin_assignments%ROWTYPE; v_new record;
BEGIN
  SELECT * INTO v_old FROM public.round_robin_assignments WHERE id=p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF v_old.status <> 'assigned' THEN RAISE EXCEPTION 'assignment is not active'; END IF;

  UPDATE public.round_robin_assignments SET status='reassigned', released_at=now(), reason=left(p_reason,500) WHERE id=v_old.id;
  IF v_old.member_id IS NOT NULL THEN
    UPDATE public.round_robin_members SET current_active=GREATEST(current_active-1,0), updated_at=now() WHERE id=v_old.member_id;
  END IF;

  SELECT * INTO v_new FROM public.assign_round_robin(v_old.team_id, v_old.subject_type, v_old.subject_id,
    CASE WHEN p_manual_member_id IS NOT NULL THEN 'manual_override'::public.assignment_strategy END, p_manual_member_id);
  UPDATE public.round_robin_assignments SET reassigned_from_assignment_id=v_old.id WHERE id=v_new.assignment_id;
  RETURN QUERY SELECT v_new.assignment_id, v_new.member_id, v_new.strategy, v_new.status;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.enqueue_automation_execution(uuid,uuid,text,text,jsonb,text,integer),
  public.claim_automation_executions(text,integer,integer),
  public.finish_automation_execution(uuid,text,text,text,jsonb),
  public.assign_round_robin(uuid,text,uuid,public.assignment_strategy,uuid),
  public.reassign_round_robin(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.enqueue_automation_execution(uuid,uuid,text,text,jsonb,text,integer),
  public.claim_automation_executions(text,integer,integer),
  public.finish_automation_execution(uuid,text,text,text,jsonb),
  public.assign_round_robin(uuid,text,uuid,public.assignment_strategy,uuid),
  public.reassign_round_robin(uuid,text,uuid)
  TO service_role;

COMMIT;

-- ROLLBACK (manual, only if needed; new tables contain only new data):
-- DROP FUNCTION public.reassign_round_robin(uuid,text,uuid);
-- DROP FUNCTION public.finish_automation_execution(uuid,text,text,text,jsonb);
-- DROP FUNCTION public.claim_automation_executions(text,integer,integer);
-- DROP FUNCTION public.enqueue_automation_execution(uuid,uuid,text,text,jsonb,text,integer);
-- DROP TABLE public.automation_events, public.automation_execution_attempts, public.automation_executions;
-- DROP INDEX IF EXISTS public.rr_assignments_one_active_uniq;
-- Re-run the assign_round_robin definition from 04_db4_app_crm.sql to restore the previous version.
