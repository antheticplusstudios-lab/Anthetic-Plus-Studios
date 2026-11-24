-- DB4 additive compatibility reconciliation for the current runtime.
BEGIN;
ALTER TABLE public.round_robin_rules ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text,
  ADD COLUMN IF NOT EXISTS sender_id uuid,
  ADD COLUMN IF NOT EXISTS sender_type text;
ALTER TABLE public.round_robin_assignments
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS skipped_member_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS resume_at timestamptz;
COMMIT;
