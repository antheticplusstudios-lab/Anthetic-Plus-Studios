-- DB1 app_auth: additive Gen 2 audit_logs columns.
-- Live check 2026-10-02: has actor_id uuid (no actor/event_type), target_id uuid, 0 rows.
-- actor_id is kept (not dropped); actor_user_id is plain uuid with NO auth.users FK, per bootstrap.
BEGIN;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS before_value jsonb,
  ADD COLUMN IF NOT EXISTS after_value jsonb,
  ADD COLUMN IF NOT EXISTS request_id text;
UPDATE public.audit_logs SET actor_user_id = actor_id WHERE actor_user_id IS NULL AND actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx ON public.audit_logs(actor_user_id);
NOTIFY pgrst, 'reload schema';
COMMIT;
