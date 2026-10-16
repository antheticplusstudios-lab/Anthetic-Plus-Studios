-- DB4 workflow worker hardening.
-- Adds a lease-based atomic claim path for generic workflow_runs.
-- This mirrors claim_automation_executions and prevents duplicate execution across workers.
BEGIN;

ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS workflow_runs_lease_idx
  ON public.workflow_runs (locked_until) WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.claim_workflow_runs(
  p_worker_id text,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.workflow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT r.id
    FROM public.workflow_runs r
    WHERE (
      (r.status = 'queued')
      OR (r.status = 'waiting' AND r.resume_at IS NOT NULL AND r.resume_at <= now())
      OR (r.status = 'running' AND r.locked_until IS NOT NULL AND r.locked_until < now())
    )
    ORDER BY
      CASE WHEN r.status = 'waiting' THEN r.resume_at ELSE r.queued_at END ASC NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.workflow_runs r
  SET status='running',
      locked_by=p_worker_id,
      locked_until=now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 3600)),
      attempt_count=r.attempt_count + 1,
      started_at=COALESCE(r.started_at, now()),
      updated_at=now()
  FROM picked
  WHERE r.id=picked.id
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workflow_runs(text,integer,integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workflow_runs(text,integer,integer) TO service_role;

COMMIT;
