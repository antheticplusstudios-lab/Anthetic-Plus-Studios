-- AntheticPlus DB4: app_crm
-- CRM, conversations, leads, appointments, round-robin, workflow definitions/runs.
-- No browser/client database access: FastAPI + workers use the DB4 service key only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE public.conversation_channel AS ENUM ('web_chat','phone_call','whatsapp','messenger','instagram','telegram','sms'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.conversation_status AS ENUM ('active','completed','handed_off_to_human','failed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_role AS ENUM ('user','assistant','system','tool'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.lead_status AS ENUM ('new','qualified','contacted','won','lost','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.appointment_status AS ENUM ('booked','completed','canceled','no_show','rescheduled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.assignment_strategy AS ENUM ('round_robin','least_assigned','least_active','priority','weighted','manual_override'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.assignment_status AS ENUM ('assigned','released','reassigned','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.workflow_status AS ENUM ('draft','active','paused','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.workflow_run_status AS ENUM ('queued','running','waiting','completed','failed','canceled','dead_letter'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.outbox_status AS ENUM ('pending','processing','processed','retryable','dead_letter'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.crm_clients (
  id uuid PRIMARY KEY,
  company_name text NOT NULL DEFAULT '',
  website_url text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  primary_email text NOT NULL DEFAULT '',
  primary_phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,tag)
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid NOT NULL,
  channel public.conversation_channel NOT NULL,
  visitor_session text,
  customer_phone_or_id text,
  origin text,
  status public.conversation_status NOT NULL DEFAULT 'active',
  assigned_user_id uuid,
  assigned_team_id uuid,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  handed_off_at timestamptz,
  handoff_reason text,
  audio_recording_url text,
  extracted_lead_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  content text NOT NULL,
  tokens_used integer NOT NULL DEFAULT 0,
  provider_key text,
  model text,
  external_message_id text,
  trace_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'widget',
  lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  status public.lead_status NOT NULL DEFAULT 'new',
  trace_id text,
  webhook_status text,
  webhook_response text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  status public.appointment_status NOT NULL DEFAULT 'booked',
  visitor_name text NOT NULL DEFAULT '',
  visitor_email text NOT NULL DEFAULT '',
  visitor_phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  external_ref text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 240),
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);

CREATE TABLE IF NOT EXISTS public.ticket_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  sentiment numeric(6,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','resolved','closed')),
  trace_id text,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  visitor_contact text NOT NULL DEFAULT '',
  assigned_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  automation_id uuid,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  transcript text NOT NULL,
  what_went_wrong text NOT NULL,
  recommended_fix text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Round-robin is a first-class durable CRM feature; Redis only accelerates state/locking.
CREATE TABLE IF NOT EXISTS public.round_robin_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid,
  name text NOT NULL,
  assignment_strategy public.assignment_strategy NOT NULL DEFAULT 'round_robin',
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  fallback_member_id uuid,
  overflow_behavior text NOT NULL DEFAULT 'queue' CHECK (overflow_behavior IN ('queue','fallback','unassigned','manual')),
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.round_robin_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.round_robin_teams(id) ON DELETE CASCADE,
  user_id uuid,
  external_assignee_key text,
  display_name text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 100,
  weight integer NOT NULL DEFAULT 1 CHECK (weight > 0),
  availability_status text NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available','busy','offline','paused')),
  is_active boolean NOT NULL DEFAULT true,
  max_active integer,
  max_daily integer,
  current_active integer NOT NULL DEFAULT 0,
  assigned_today integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR external_assignee_key IS NOT NULL)
);

ALTER TABLE public.round_robin_teams
  DROP CONSTRAINT IF EXISTS rr_team_fallback_fk;
ALTER TABLE public.round_robin_teams
  ADD CONSTRAINT rr_team_fallback_fk FOREIGN KEY (fallback_member_id) REFERENCES public.round_robin_members(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.round_robin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.round_robin_teams(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('lead','conversation','appointment','handoff','support')),
  priority integer NOT NULL DEFAULT 100,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.round_robin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.round_robin_teams(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES public.round_robin_members(id) ON DELETE SET NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('lead','conversation','appointment','handoff','support')),
  subject_id uuid NOT NULL,
  status public.assignment_status NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  reassigned_from_assignment_id uuid REFERENCES public.round_robin_assignments(id) ON DELETE SET NULL,
  strategy public.assignment_strategy NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.round_robin_state (
  team_id uuid PRIMARY KEY REFERENCES public.round_robin_teams(id) ON DELETE CASCADE,
  next_index integer NOT NULL DEFAULT 0,
  last_assigned_member_id uuid REFERENCES public.round_robin_members(id) ON DELETE SET NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Durable workflow engine metadata/definitions. Execution itself belongs to workers + Redis.
CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status public.workflow_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,name,version)
);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order >= 0),
  step_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeout_seconds integer NOT NULL DEFAULT 300 CHECK (timeout_seconds > 0),
  UNIQUE(workflow_id,step_order)
);

CREATE TABLE IF NOT EXISTS public.workflow_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  cron_expression text,
  timezone text NOT NULL DEFAULT 'UTC',
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  endpoint_key_hash text NOT NULL UNIQUE,
  secret_ciphertext text NOT NULL,
  encryption_key_version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE RESTRICT,
  automation_id uuid,
  trigger_event_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  status public.workflow_run_status NOT NULL DEFAULT 'queued',
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step_order integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE RESTRICT,
  status public.workflow_run_status NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_run_id,step_id)
);

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status public.outbox_status NOT NULL DEFAULT 'pending',
  locked_by text,
  locked_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.processed_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  payload_hash text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_client_idx ON public.conversations(client_id,last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_automation_idx ON public.conversations(automation_id,last_message_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id,created_at);
CREATE INDEX IF NOT EXISTS leads_client_idx ON public.leads(client_id,created_at DESC);
CREATE INDEX IF NOT EXISTS leads_automation_idx ON public.leads(automation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS appointments_automation_idx ON public.appointments(automation_id,starts_at);
CREATE INDEX IF NOT EXISTS rr_members_team_idx ON public.round_robin_members(team_id,is_active,availability_status,priority DESC);
CREATE INDEX IF NOT EXISTS rr_rules_team_idx ON public.round_robin_rules(team_id,enabled,priority DESC);
CREATE INDEX IF NOT EXISTS rr_assignments_subject_idx ON public.round_robin_assignments(subject_type,subject_id,created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_queue_idx ON public.workflow_runs(status,queued_at)
  WHERE status IN ('queued','running','waiting');
CREATE INDEX IF NOT EXISTS workflow_steps_order_idx ON public.workflow_steps(workflow_id,step_order);
CREATE INDEX IF NOT EXISTS outbox_queue_idx ON public.outbox_events(status,next_attempt_at,created_at)
  WHERE status IN ('pending','retryable','processing');

DROP TRIGGER IF EXISTS crm_clients_touch ON public.crm_clients;
CREATE TRIGGER crm_clients_touch BEFORE UPDATE ON public.crm_clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS conversations_touch ON public.conversations;
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS leads_touch ON public.leads;
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS appointments_touch ON public.appointments;
CREATE TRIGGER appointments_touch BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS ticket_escalations_touch ON public.ticket_escalations;
CREATE TRIGGER ticket_escalations_touch BEFORE UPDATE ON public.ticket_escalations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS rr_teams_touch ON public.round_robin_teams;
CREATE TRIGGER rr_teams_touch BEFORE UPDATE ON public.round_robin_teams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS rr_members_touch ON public.round_robin_members;
CREATE TRIGGER rr_members_touch BEFORE UPDATE ON public.round_robin_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS rr_rules_touch ON public.round_robin_rules;
CREATE TRIGGER rr_rules_touch BEFORE UPDATE ON public.round_robin_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS workflow_definitions_touch ON public.workflow_definitions;
CREATE TRIGGER workflow_definitions_touch BEFORE UPDATE ON public.workflow_definitions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS workflow_runs_touch ON public.workflow_runs;
CREATE TRIGGER workflow_runs_touch BEFORE UPDATE ON public.workflow_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_outbox(p_event_type text,p_aggregate_type text,p_aggregate_id uuid,p_idempotency_key text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.outbox_events(event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(p_event_type,p_aggregate_type,p_aggregate_id,p_idempotency_key,COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_outbox_events(p_worker_id text,p_batch_size integer)
RETURNS SETOF public.outbox_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.outbox_events
    WHERE status='pending'
       OR (status='retryable' AND next_attempt_at<=now())
       OR (status='processing' AND locked_at<now()-interval '5 minutes')
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT GREATEST(1,p_batch_size)
  )
  UPDATE public.outbox_events e
  SET status='processing',locked_by=p_worker_id,locked_at=now(),attempt_count=e.attempt_count+1
  FROM picked WHERE e.id=picked.id RETURNING e.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_outbox_event(p_event_id uuid,p_worker_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.outbox_events SET status='processed',processed_at=now(),locked_by=NULL,locked_at=NULL,last_error=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(p_event_id uuid,p_worker_id text,p_error text,p_retry_at timestamptz,p_dead_letter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.outbox_events
  SET status=CASE WHEN p_dead_letter THEN 'dead_letter' ELSE 'retryable' END,
      last_error=left(COALESCE(p_error,''),4000),next_attempt_at=COALESCE(p_retry_at,now()+interval '5 minutes'),locked_by=NULL,locked_at=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean) TO service_role;


-- Transactional Round-Robin assignment helper. Redis may cache state, but durable assignment remains DB4.
CREATE OR REPLACE FUNCTION public.assign_round_robin(
  p_team_id uuid, p_subject_type text, p_subject_id uuid, p_strategy public.assignment_strategy DEFAULT NULL, p_manual_member_id uuid DEFAULT NULL
)
RETURNS TABLE(assignment_id uuid, member_id uuid, strategy public.assignment_strategy, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_team public.round_robin_teams%ROWTYPE;
  v_strategy public.assignment_strategy;
  v_member public.round_robin_members%ROWTYPE;
  v_assignment uuid;
  v_count integer;
BEGIN
  SELECT * INTO v_team FROM public.round_robin_teams WHERE id=p_team_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round robin team not found or inactive'; END IF;
  v_strategy := COALESCE(p_strategy, v_team.assignment_strategy);
  IF v_strategy='manual_override' THEN
    SELECT * INTO v_member FROM public.round_robin_members WHERE id=p_manual_member_id AND team_id=p_team_id AND is_active;
  ELSE
    SELECT count(*) INTO v_count FROM public.round_robin_assignments WHERE team_id=p_team_id AND subject_type=p_subject_type AND subject_id=p_subject_id;
    IF v_count > 0 THEN
      SELECT a.id,a.member_id,v_strategy,a.status::text INTO assignment_id,member_id,strategy,status FROM public.round_robin_assignments a WHERE a.team_id=p_team_id AND a.subject_type=p_subject_type AND a.subject_id=p_subject_id ORDER BY a.created_at DESC LIMIT 1;
      RETURN NEXT; RETURN;
    END IF;
    SELECT m.* INTO v_member
    FROM public.round_robin_members m
    WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
      AND (m.max_active IS NULL OR m.current_active < m.max_active)
      AND (m.max_daily IS NULL OR m.assigned_today < m.max_daily)
    ORDER BY
      CASE WHEN v_strategy='priority' THEN m.priority END DESC NULLS LAST,
      CASE WHEN v_strategy='least_active' THEN m.current_active END ASC NULLS LAST,
      CASE WHEN v_strategy='least_assigned' THEN m.assigned_today END ASC NULLS LAST,
      CASE WHEN v_strategy='weighted' THEN m.weight END DESC NULLS LAST,
      m.priority DESC, m.assigned_today ASC, m.created_at ASC
    LIMIT 1;
  END IF;
  IF v_member.id IS NULL THEN
    IF v_team.fallback_member_id IS NOT NULL THEN
      SELECT * INTO v_member FROM public.round_robin_members WHERE id=v_team.fallback_member_id AND team_id=p_team_id AND is_active;
    END IF;
  END IF;
  INSERT INTO public.round_robin_assignments(team_id,member_id,subject_type,subject_id,status,strategy,metadata)
  VALUES(p_team_id,v_member.id,p_subject_type,p_subject_id,CASE WHEN v_member.id IS NULL THEN 'released' ELSE 'assigned' END,v_strategy,
         jsonb_build_object('overflow_behavior',v_team.overflow_behavior))
  RETURNING id INTO v_assignment;
  IF v_member.id IS NOT NULL THEN
    UPDATE public.round_robin_members SET current_active=current_active+1,assigned_today=assigned_today+1,updated_at=now() WHERE id=v_member.id;
    UPDATE public.round_robin_state SET last_assigned_member_id=v_member.id,version=version+1,updated_at=now() WHERE team_id=p_team_id;
    IF NOT FOUND THEN INSERT INTO public.round_robin_state(team_id,last_assigned_member_id,version) VALUES(p_team_id,v_member.id,1); END IF;
  END IF;
  RETURN QUERY SELECT v_assignment,v_member.id,v_strategy,CASE WHEN v_member.id IS NULL THEN 'unassigned' ELSE 'assigned' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_round_robin(uuid,text,uuid,public.assignment_strategy,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_round_robin(uuid,text,uuid,public.assignment_strategy,uuid) TO service_role;

-- Production hardening: durable workflow resumption and true round-robin cursoring.
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS resume_at timestamptz;
CREATE INDEX IF NOT EXISTS workflow_runs_ready_idx
  ON public.workflow_runs(status, resume_at, queued_at)
  WHERE status IN ('queued','running','waiting');

CREATE OR REPLACE FUNCTION public.assign_round_robin(
  p_team_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_strategy public.assignment_strategy DEFAULT NULL,
  p_manual_member_id uuid DEFAULT NULL
)
RETURNS TABLE(assignment_id uuid, member_id uuid, strategy public.assignment_strategy, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_team public.round_robin_teams%ROWTYPE;
  v_strategy public.assignment_strategy;
  v_member public.round_robin_members%ROWTYPE;
  v_assignment uuid;
  v_state public.round_robin_state%ROWTYPE;
  v_count integer;
  v_offset integer;
BEGIN
  SELECT * INTO v_team
  FROM public.round_robin_teams
  WHERE id=p_team_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round robin team not found or inactive'; END IF;

  v_strategy := COALESCE(p_strategy, v_team.assignment_strategy);

  SELECT a.id,a.member_id,v_strategy,a.status::text
    INTO assignment_id,member_id,strategy,status
  FROM public.round_robin_assignments a
  WHERE a.team_id=p_team_id AND a.subject_type=p_subject_type AND a.subject_id=p_subject_id
  ORDER BY a.created_at DESC LIMIT 1;
  IF assignment_id IS NOT NULL THEN RETURN NEXT; RETURN; END IF;

  INSERT INTO public.round_robin_state(team_id,next_index,version)
  VALUES(p_team_id,0,0)
  ON CONFLICT(team_id) DO NOTHING;
  SELECT * INTO v_state FROM public.round_robin_state WHERE team_id=p_team_id FOR UPDATE;

  IF v_strategy='manual_override' THEN
    SELECT * INTO v_member
    FROM public.round_robin_members
    WHERE id=p_manual_member_id AND team_id=p_team_id AND is_active;
  ELSIF v_strategy='round_robin' THEN
    SELECT count(*) INTO v_count
    FROM public.round_robin_members m
    WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
      AND (m.max_active IS NULL OR m.current_active<m.max_active)
      AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily);
    IF v_count>0 THEN
      v_offset := v_state.next_index % v_count;
      SELECT m.* INTO v_member
      FROM (
        SELECT m.*, row_number() OVER (ORDER BY m.created_at,m.id)-1 AS rn
        FROM public.round_robin_members m
        WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
          AND (m.max_active IS NULL OR m.current_active<m.max_active)
          AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily)
      ) m
      WHERE m.rn=v_offset;
    END IF;
  ELSE
    SELECT m.* INTO v_member
    FROM public.round_robin_members m
    WHERE m.team_id=p_team_id AND m.is_active AND m.availability_status='available'
      AND (m.max_active IS NULL OR m.current_active<m.max_active)
      AND (m.max_daily IS NULL OR m.assigned_today<m.max_daily)
    ORDER BY
      CASE WHEN v_strategy='priority' THEN m.priority END DESC NULLS LAST,
      CASE WHEN v_strategy='least_active' THEN m.current_active END ASC NULLS LAST,
      CASE WHEN v_strategy='least_assigned' THEN m.assigned_today END ASC NULLS LAST,
      CASE WHEN v_strategy='weighted' THEN m.weight END DESC NULLS LAST,
      m.priority DESC,m.assigned_today ASC,m.created_at ASC,m.id ASC
    LIMIT 1;
  END IF;

  IF v_member.id IS NULL AND v_team.fallback_member_id IS NOT NULL THEN
    SELECT * INTO v_member
    FROM public.round_robin_members
    WHERE id=v_team.fallback_member_id AND team_id=p_team_id AND is_active;
  END IF;

  INSERT INTO public.round_robin_assignments(team_id,member_id,subject_type,subject_id,status,strategy,metadata)
  VALUES(p_team_id,v_member.id,p_subject_type,p_subject_id,
         CASE WHEN v_member.id IS NULL THEN 'released' ELSE 'assigned' END,
         v_strategy,jsonb_build_object('overflow_behavior',v_team.overflow_behavior))
  RETURNING id INTO v_assignment;

  IF v_member.id IS NOT NULL THEN
    UPDATE public.round_robin_members
    SET current_active=current_active+1,assigned_today=assigned_today+1,updated_at=now()
    WHERE id=v_member.id;
    UPDATE public.round_robin_state
    SET last_assigned_member_id=v_member.id, next_index=next_index+1, version=version+1, updated_at=now()
    WHERE team_id=p_team_id;
  END IF;

  RETURN QUERY SELECT v_assignment,v_member.id,v_strategy,
    CASE WHEN v_member.id IS NULL THEN 'unassigned' ELSE 'assigned' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_round_robin(uuid,text,uuid,public.assignment_strategy,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_round_robin(uuid,text,uuid,public.assignment_strategy,uuid) TO service_role;
