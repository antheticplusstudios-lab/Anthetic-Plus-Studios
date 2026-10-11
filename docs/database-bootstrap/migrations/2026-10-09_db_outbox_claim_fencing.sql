-- V6 OUTBOX CLAIM FENCING MIGRATION
-- Apply separately to DB1, DB2, DB3 and DB4 only after taking a backup/staging snapshot.
-- This file intentionally contains no free-trial index; that optional index remains separate.
-- Rollback procedure and verification: docs/database-bootstrap/OUTBOX_CLAIM_FENCING.md
-- PostgreSQL 13+ supplies gen_random_uuid() in core. No extension is required by this migration.
-- Run as one transaction so a failure cannot leave only some RPCs fenced.
BEGIN;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS claim_token text;

CREATE OR REPLACE FUNCTION public.claim_outbox_events(p_worker_id text, p_batch_size integer)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(btrim(p_worker_id)) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.outbox_events
    WHERE status = 'pending'
       OR (status = 'retryable' AND next_attempt_at <= now())
       OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 1), 100))
  )
  UPDATE public.outbox_events e
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = clock_timestamp(),
      claim_token = gen_random_uuid()::text,
      attempt_count = e.attempt_count + 1
  FROM picked
  WHERE e.id = picked.id
  RETURNING e.*;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_outbox_event(uuid, text);
DROP FUNCTION IF EXISTS public.fail_outbox_event(uuid, text, text, timestamptz, boolean);

CREATE OR REPLACE FUNCTION public.complete_outbox_event(
  p_event_id uuid, p_worker_id text, p_claim_token text, p_locked_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE affected integer;
BEGIN
  IF p_claim_token IS NULL OR p_claim_token = '' OR p_locked_at IS NULL OR p_worker_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.outbox_events
  SET status = 'processed', processed_at = now(), locked_by = NULL, locked_at = NULL,
      claim_token = NULL, last_error = NULL
  WHERE id = p_event_id AND status = 'processing' AND locked_by = p_worker_id
    AND claim_token = p_claim_token AND locked_at = p_locked_at;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(
  p_event_id uuid, p_worker_id text, p_error text, p_retry_at timestamptz,
  p_dead_letter boolean, p_claim_token text, p_locked_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE affected integer;
BEGIN
  IF p_claim_token IS NULL OR p_claim_token = '' OR p_locked_at IS NULL OR p_worker_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.outbox_events
  SET status = CASE WHEN p_dead_letter THEN 'dead_letter'::public.outbox_status ELSE 'retryable'::public.outbox_status END,
      last_error = left(COALESCE(p_error, ''), 4000),
      next_attempt_at = COALESCE(p_retry_at, now() + interval '5 minutes'),
      locked_by = NULL, locked_at = NULL, claim_token = NULL
  WHERE id = p_event_id AND status = 'processing' AND locked_by = p_worker_id
    AND claim_token = p_claim_token AND locked_at = p_locked_at;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox_events(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_outbox_event(uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid, text, text, timestamptz, boolean, text, timestamptz) FROM PUBLIC;
DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.claim_outbox_events(text, integer) FROM anon;
    REVOKE ALL ON FUNCTION public.complete_outbox_event(uuid, text, text, timestamptz) FROM anon;
    REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid, text, text, timestamptz, boolean, text, timestamptz) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.claim_outbox_events(text, integer) FROM authenticated;
    REVOKE ALL ON FUNCTION public.complete_outbox_event(uuid, text, text, timestamptz) FROM authenticated;
    REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid, text, text, timestamptz, boolean, text, timestamptz) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_outbox_events(text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.complete_outbox_event(uuid, text, text, timestamptz) TO service_role;
    GRANT EXECUTE ON FUNCTION public.fail_outbox_event(uuid, text, text, timestamptz, boolean, text, timestamptz) TO service_role;
  END IF;
END
$permissions$;
COMMIT;

-- Verify migration: expect claim_token column and the two boolean-returning fenced RPC signatures.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='outbox_events' AND column_name='claim_token';
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('claim_outbox_events','complete_outbox_event','fail_outbox_event')
ORDER BY p.proname;
