-- AntheticPlus DB2: app_billing
-- Billing + automation runtime source of truth.
-- No browser/client database access: FastAPI uses the DB2 service key only.
-- Cross-database IDs are UUIDs with no cross-database foreign keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('pending_verification','approved','rejected','canceled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_verification_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','suspended','canceled','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.automation_run_state AS ENUM ('active','paused','stopped','disabled','suspended','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.installation_status AS ENUM ('active','revoked','replaced','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.health_status AS ENUM ('ok','warn','fail','skip','unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.outbox_status AS ENUM ('pending','processing','processed','retryable','dead_letter'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.pricing_plans (
  slug text PRIMARY KEY,
  product_type text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  monthly_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  yearly_price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  listed boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_prices (
  product text NOT NULL,
  option_key text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'USD',
  kind text NOT NULL DEFAULT 'channel',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, option_key)
);

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  percent_off integer NOT NULL DEFAULT 0 CHECK (percent_off BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_name text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  required_fields jsonb NOT NULL DEFAULT '["sender_phone","trx_id"]'::jsonb,
  is_card boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE DEFAULT ('ORD-' || upper(substr(md5(gen_random_uuid()::text),1,8))),
  client_id uuid NOT NULL,
  created_by_user_id uuid,
  automation_type text NOT NULL CHECK (automation_type IN ('ai_receptionist','lead_capture','kb_support','messaging_ai')),
  delivery_channel text NOT NULL DEFAULT 'web',
  selected_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  full_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  target_domain_url text NOT NULL,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_proof_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  origin_domain text,
  status public.order_status NOT NULL DEFAULT 'pending_verification',
  rejection_reason text,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  submitted_by_user_id uuid,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  transaction_id text NOT NULL,
  sender_name text NOT NULL DEFAULT '',
  sender_phone text,
  proof_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status public.payment_verification_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  verified_by_user_id uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_id uuid,
  plan_slug text,
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  started_at timestamptz NOT NULL DEFAULT now(),
  renewal_at timestamptz,
  expires_at timestamptz,
  grace_period_end timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  provider text,
  provider_subscription_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  automation_type text NOT NULL CHECK (automation_type IN ('ai_receptionist','lead_capture','kb_support','messaging_ai')),
  name text NOT NULL DEFAULT '',
  domain_url text NOT NULL DEFAULT '',
  allowed_domains text[] NOT NULL DEFAULT '{}',
  webhook_url text,
  assigned_phone_number text,
  run_state public.automation_run_state NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true,
  script_token_hash text NOT NULL UNIQUE,
  script_token_last4 text NOT NULL DEFAULT '',
  hmac_secret_ciphertext text,
  hmac_key_version integer NOT NULL DEFAULT 1,
  requires_reinstallation boolean NOT NULL DEFAULT false,
  widget_config_version integer NOT NULL DEFAULT 1,
  widget_config jsonb NOT NULL DEFAULT '{"style":"metal-balls","primary":"#FF0000","secondary":"#FF0000","center":"#FBFBFB","glow":"#FF0000","size":64,"position":"bottom-right","ballCount":32,"radius":37,"ballSize":3,"centerSize":31,"tilt":49,"variation":0.14,"shine":true,"speed":1,"stateAnimations":{"idle":{"enabled":true,"speed":1,"energy":0.25},"listening":{"enabled":true,"speed":1.1,"energy":0.6},"thinking":{"enabled":true,"speed":1.3,"energy":0.85},"speaking":{"enabled":true,"speed":1.25,"energy":1},"message":{"enabled":true,"speed":1.1,"energy":0.7},"success":{"enabled":true,"speed":0.9,"energy":0.5},"handoff":{"enabled":true,"speed":1,"energy":0.5},"error":{"enabled":true,"speed":1,"energy":0.9},"offline":{"enabled":false,"speed":0,"energy":0}},"labels":{"idle":"Online","listening":"Listening…","thinking":"Thinking…","speaking":"Replying…","message":"New message","success":"Done","handoff":"Connecting you to a person","error":"Something went wrong","offline":"Offline"},"welcome":"Hello! How can I help you today?","placeholder":"Type your message…","sound":false,"chat":{"title":"AI Assistant","subtitle":"Usually replies instantly","autoOpen":false},"mobile":{"hidden":false,"size":56},"desktop":{"size":64},"fallback":{"enabled":true,"type":"static"},"advanced":{"debug":false}}'::jsonb,
  origin_domain text,
  expires_at timestamptz,
  renewal_at timestamptz,
  last_seen_at timestamptz,
  last_seen_origin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  script_generation_id uuid,
  domain text NOT NULL,
  status public.installation_status NOT NULL DEFAULT 'active',
  installed_at timestamptz,
  verified_at timestamptz,
  revoked_at timestamptz,
  replaced_by_installation_id uuid,
  last_seen_at timestamptz,
  last_seen_origin text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.script_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  token_hint text NOT NULL,
  token_created_at timestamptz NOT NULL DEFAULT now(),
  generated_by_user_id uuid,
  invalidated_at timestamptz,
  invalidated_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_installations
  DROP CONSTRAINT IF EXISTS automation_installations_script_generation_fk;
ALTER TABLE public.automation_installations
  ADD CONSTRAINT automation_installations_script_generation_fk
  FOREIGN KEY (script_generation_id) REFERENCES public.script_generations(id) ON DELETE SET NULL;

ALTER TABLE public.automation_installations
  DROP CONSTRAINT IF EXISTS automation_installations_replaced_by_fk;
ALTER TABLE public.automation_installations
  ADD CONSTRAINT automation_installations_replaced_by_fk
  FOREIGN KEY (replaced_by_installation_id) REFERENCES public.automation_installations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.automation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  task_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, task_key)
);

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  account_label text,
  credential_ciphertext text NOT NULL,
  encryption_key_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('pending','connected','error','revoked','expired')),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, provider)
);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  metric_name text NOT NULL,
  quantity numeric(20,6) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'count',
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  billing_period text NOT NULL,
  call_minutes_used numeric(20,4) NOT NULL DEFAULT 0,
  sms_count_used bigint NOT NULL DEFAULT 0,
  tokens_used bigint NOT NULL DEFAULT 0,
  messages_count_used bigint NOT NULL DEFAULT 0,
  workflow_runs_used bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, billing_period)
);

CREATE TABLE IF NOT EXISTS public.automation_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  check_type text NOT NULL,
  status public.health_status NOT NULL,
  latency_ms integer,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_health_state (
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  check_type text NOT NULL,
  status public.health_status NOT NULL,
  latency_ms integer,
  last_error text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  recovered_at timestamptz,
  PRIMARY KEY (automation_id, check_type)
);

CREATE TABLE IF NOT EXISTS public.automation_health (
  automation_id uuid PRIMARY KEY REFERENCES public.client_automations(id) ON DELETE RESTRICT,
  overall text NOT NULL DEFAULT 'UNKNOWN' CHECK (overall IN ('HEALTHY','DEGRADED','WARNING','ERROR','OFFLINE','SUSPENDED','UNCHECKED','UNKNOWN')) ,
  summary text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
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

CREATE INDEX IF NOT EXISTS orders_client_idx ON public.orders(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_order_idx ON public.payment_verifications(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_client_idx ON public.subscriptions(client_id, status);
CREATE INDEX IF NOT EXISTS automations_client_idx ON public.client_automations(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automations_state_idx ON public.client_automations(run_state, is_active, expires_at);
CREATE INDEX IF NOT EXISTS automation_installations_automation_idx ON public.automation_installations(automation_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS automation_installations_active_domain_uq ON public.automation_installations(automation_id, lower(domain)) WHERE status='active';
CREATE INDEX IF NOT EXISTS script_generations_automation_idx ON public.script_generations(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_connections_automation_idx ON public.integration_connections(automation_id);
CREATE INDEX IF NOT EXISTS usage_events_automation_idx ON public.usage_events(automation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS health_checks_automation_idx ON public.automation_health_checks(automation_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS outbox_queue_idx ON public.outbox_events(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retryable','processing');

DROP TRIGGER IF EXISTS pricing_plans_touch ON public.pricing_plans;
CREATE TRIGGER pricing_plans_touch BEFORE UPDATE ON public.pricing_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS product_prices_touch ON public.product_prices;
CREATE TRIGGER product_prices_touch BEFORE UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS promo_codes_touch ON public.promo_codes;
CREATE TRIGGER promo_codes_touch BEFORE UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS payment_methods_touch ON public.payment_methods;
CREATE TRIGGER payment_methods_touch BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS orders_touch ON public.orders;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS subscriptions_touch ON public.subscriptions;
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS automations_touch ON public.client_automations;
CREATE TRIGGER automations_touch BEFORE UPDATE ON public.client_automations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS installations_touch ON public.automation_installations;
CREATE TRIGGER installations_touch BEFORE UPDATE ON public.automation_installations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tasks_touch ON public.automation_tasks;
CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.automation_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS connections_touch ON public.integration_connections;
CREATE TRIGGER connections_touch BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Raw installation tokens never live in DB2. The raw token is generated once, hashed here, and returned to the server.
CREATE OR REPLACE FUNCTION public.set_automation_runtime_state(
  p_automation_id uuid,
  p_state public.automation_run_state,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_before jsonb; v_after jsonb; v_client uuid; v_active boolean;
BEGIN
  IF COALESCE(trim(p_reason),'')='' AND p_state IN ('paused','stopped','disabled','suspended','expired') THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;
  SELECT jsonb_build_object('run_state',run_state,'is_active',is_active,'expires_at',expires_at,'requires_reinstallation',requires_reinstallation), client_id, is_active
    INTO v_before,v_client,v_active
  FROM public.client_automations WHERE id=p_automation_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'automation not found'; END IF;
  UPDATE public.client_automations
  SET run_state=p_state,
      is_active=(p_state='active'),
      updated_at=now()
  WHERE id=p_automation_id;
  SELECT jsonb_build_object('run_state',run_state,'is_active',is_active,'expires_at',expires_at,'requires_reinstallation',requires_reinstallation)
    INTO v_after FROM public.client_automations WHERE id=p_automation_id;
  PERFORM public.enqueue_outbox('automation.state_changed','automation',p_automation_id,
    COALESCE(NULLIF(trim(p_idempotency_key),''),'automation-state:'||p_automation_id::text||':'||p_state::text),
    jsonb_build_object('automation_id',p_automation_id,'client_id',v_client,'actor_user_id',p_actor_user_id,'reason',p_reason,'before',v_before,'after',v_after));
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_automation_token(p_automation_id uuid, p_generated_by uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_hash text;
  v_generation_id uuid;
BEGIN
  v_raw := encode(gen_random_bytes(32),'hex');
  v_hash := encode(digest(v_raw,'sha256'),'hex');
  UPDATE public.script_generations SET invalidated_at=now(), invalidated_reason='rotated' WHERE automation_id=p_automation_id AND invalidated_at IS NULL;
  UPDATE public.automation_installations SET status='replaced', revoked_at=now() WHERE automation_id=p_automation_id AND status='active';
  UPDATE public.client_automations
  SET script_token_hash=v_hash,
      script_token_last4=right(v_raw,4),
      requires_reinstallation=true,
      updated_at=now()
  WHERE id=p_automation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;
  INSERT INTO public.script_generations(automation_id, token_hint, generated_by_user_id)
  VALUES (p_automation_id, right(v_raw,6), p_generated_by)
  RETURNING id INTO v_generation_id;
  PERFORM public.enqueue_outbox('automation.credentials_rotated','automation',p_automation_id,
    'automation-credentials-rotation:'||v_generation_id::text,
    jsonb_build_object('automation_id',p_automation_id,'generation_id',v_generation_id,'generated_by_user_id',p_generated_by,'token_hint',right(v_raw,6)));
  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_widget_installation(p_token text)
RETURNS TABLE(
  automation_id uuid,
  client_id uuid,
  automation_type text,
  name text,
  domain_url text,
  allowed_domains text[],
  run_state text,
  is_active boolean,
  requires_reinstallation boolean,
  expires_at timestamptz,
  widget_config jsonb,
  subscription_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.client_id, a.automation_type, a.name, a.domain_url, a.allowed_domains,
         a.run_state::text, a.is_active, a.requires_reinstallation, a.expires_at,
         a.widget_config, COALESCE(s.status::text,'expired')
  FROM public.client_automations a
  LEFT JOIN public.subscriptions s ON s.id=a.subscription_id
  WHERE a.script_token_hash = encode(digest(p_token,'sha256'),'hex')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.automation_local_runtime_state(p_automation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN a.id IS NULL THEN jsonb_build_object('state','missing')
    WHEN a.run_state <> 'active' THEN jsonb_build_object('state',a.run_state::text,'is_active',a.is_active,'requires_reinstallation',a.requires_reinstallation)
    WHEN NOT a.is_active THEN jsonb_build_object('state','disabled','is_active',false,'requires_reinstallation',a.requires_reinstallation)
    WHEN a.expires_at IS NOT NULL
         AND a.expires_at <= now()
         AND NOT (s.grace_period_end IS NOT NULL AND s.grace_period_end > now())
      THEN jsonb_build_object('state','expired','is_active',false,'requires_reinstallation',a.requires_reinstallation)
    WHEN s.status IN ('suspended','canceled','expired')
         AND NOT (s.grace_period_end IS NOT NULL AND s.grace_period_end > now())
      THEN jsonb_build_object('state',s.status::text,'is_active',false,'requires_reinstallation',a.requires_reinstallation)
    WHEN s.status='past_due'
         AND s.grace_period_end IS NOT NULL AND s.grace_period_end > now()
      THEN jsonb_build_object('state','active','is_active',true,'requires_reinstallation',a.requires_reinstallation,'billing_state','past_due')
    ELSE jsonb_build_object('state','active','is_active',true,'requires_reinstallation',a.requires_reinstallation)
  END
  FROM public.client_automations a
  LEFT JOIN public.subscriptions s ON s.id=a.subscription_id
  WHERE a.id=p_automation_id;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_outbox(p_event_type text,p_aggregate_type text,p_aggregate_id uuid,p_idempotency_key text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.outbox_events(event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(p_event_type,p_aggregate_type,p_aggregate_id,p_idempotency_key,COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_outbox_events(p_worker_id text,p_batch_size integer)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.outbox_events
    WHERE status='pending'
       OR (status='retryable' AND next_attempt_at <= now())
       OR (status='processing' AND locked_at < now() - interval '5 minutes')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1,p_batch_size)
  )
  UPDATE public.outbox_events e
  SET status='processing', locked_by=p_worker_id, locked_at=now(), attempt_count=e.attempt_count+1
  FROM picked
  WHERE e.id=picked.id
  RETURNING e.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_outbox_event(p_event_id uuid,p_worker_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.outbox_events
  SET status='processed', processed_at=now(), locked_by=NULL, locked_at=NULL, last_error=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(p_event_id uuid,p_worker_id text,p_error text,p_retry_at timestamptz,p_dead_letter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.outbox_events
  SET status=CASE WHEN p_dead_letter THEN 'dead_letter' ELSE 'retryable' END,
      last_error=left(COALESCE(p_error,''),4000),
      next_attempt_at=COALESCE(p_retry_at,now()+interval '5 minutes'),
      locked_by=NULL, locked_at=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

-- Daily billing lifecycle. Server/cron calls this RPC; it never trusts browser input.
CREATE OR REPLACE FUNCTION public.run_subscription_lifecycle()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,pg_temp
AS $$
DECLARE
  s record;
  v_next public.subscription_status;
BEGIN
  FOR s IN
    SELECT id, client_id, automation_id, status, expires_at, grace_period_end
    FROM public.subscriptions
    WHERE status IN ('trialing','active','past_due','suspended','expired')
      AND expires_at IS NOT NULL
  LOOP
    v_next := s.status;
    IF s.expires_at <= now() THEN
      IF s.grace_period_end IS NOT NULL AND s.grace_period_end > now() THEN
        v_next := 'past_due';
      ELSE
        v_next := 'suspended';
      END IF;
    END IF;

    IF v_next IS DISTINCT FROM s.status THEN
      UPDATE public.subscriptions SET status=v_next, updated_at=now() WHERE id=s.id;
      IF s.automation_id IS NOT NULL THEN
        UPDATE public.client_automations
        SET run_state = CASE WHEN v_next='suspended' THEN 'suspended' ELSE run_state END,
            is_active = CASE WHEN v_next IN ('suspended','expired','canceled') THEN false ELSE is_active END,
            updated_at=now()
        WHERE id=s.automation_id;
      END IF;
      PERFORM public.enqueue_outbox(
        'subscription.' || v_next::text, 'subscription', s.id,
        'subscription:lifecycle:' || s.id::text || ':' || v_next::text || ':' || to_char(date_trunc('day', now()), 'YYYY-MM-DD'),
        jsonb_build_object('subscription_id',s.id,'client_id',s.client_id,'automation_id',s.automation_id,
          'automation_ids',CASE WHEN s.automation_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(s.automation_id) END)
      );
    END IF;
  END LOOP;
END;
$$;

-- DB2 is server-only. Keep public/anon/authenticated completely away from the tables.
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_health_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_automation_runtime_state(uuid,public.automation_run_state,text,text,uuid), public.generate_automation_token(uuid,uuid), public.resolve_widget_installation(text), public.automation_local_runtime_state(uuid), public.run_subscription_lifecycle(), public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_automation_runtime_state(uuid,public.automation_run_state,text,text,uuid), public.generate_automation_token(uuid,uuid), public.resolve_widget_installation(text), public.automation_local_runtime_state(uuid), public.run_subscription_lifecycle(), public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean) TO service_role;

-- Compatibility catalog field used by the existing storefront/admin UI.
ALTER TABLE public.pricing_plans ADD COLUMN IF NOT EXISTS yearly_discount_pct numeric(5,2) NOT NULL DEFAULT 20 CHECK (yearly_discount_pct BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS pricing_plans_active_listed_idx ON public.pricing_plans(active, listed);


-- Atomic idempotent usage accounting. Each billable event is recorded once, then the local meter is incremented.
CREATE OR REPLACE FUNCTION public.increment_usage_meter(
  p_client_id uuid, p_automation_id uuid, p_billing_period text,
  p_metric_name text, p_quantity numeric, p_unit text, p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.usage_events(client_id,automation_id,metric_name,quantity,unit,idempotency_key,metadata)
  VALUES(p_client_id,p_automation_id,p_metric_name,p_quantity,p_unit,p_idempotency_key,COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT(idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN false; END IF;
  INSERT INTO public.usage_meters(client_id,automation_id,billing_period)
  VALUES(p_client_id,p_automation_id,p_billing_period)
  ON CONFLICT(automation_id,billing_period) DO NOTHING;
  UPDATE public.usage_meters
  SET call_minutes_used = call_minutes_used + CASE WHEN p_metric_name='call_minutes' THEN p_quantity ELSE 0 END,
      sms_count_used = sms_count_used + CASE WHEN p_metric_name='sms' THEN round(p_quantity)::bigint ELSE 0 END,
      tokens_used = tokens_used + CASE WHEN p_metric_name='tokens' THEN round(p_quantity)::bigint ELSE 0 END,
      messages_count_used = messages_count_used + CASE WHEN p_metric_name='messages' THEN round(p_quantity)::bigint ELSE 0 END,
      workflow_runs_used = workflow_runs_used + CASE WHEN p_metric_name='workflow_runs' THEN round(p_quantity)::bigint ELSE 0 END,
      updated_at=now()
  WHERE automation_id=p_automation_id AND billing_period=p_billing_period;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_usage_meter(uuid,uuid,text,text,numeric,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage_meter(uuid,uuid,text,text,numeric,text,text,jsonb) TO service_role;

-- Server-side catalog seed matching the current AntheticPlus storefront. Admin pricing can change these later.
INSERT INTO public.pricing_plans(slug,product_type,name,description,monthly_price,yearly_price,currency,active,listed,metadata) VALUES
  ('voice-sms-receptionist','ai_receptionist','AI Voice & SMS Receptionist','24/7 voice and SMS front-desk automation.',499,4789.00,'USD',true,true,'{"source":"initial_catalog","price_status":"provisional"}'::jsonb),
  ('lead-capture-qualifier','lead_capture','AI Lead Capture & Smart Qualifier','Lead capture, qualification and intelligent follow-up automation.',299,2870.40,'USD',true,true,'{"source":"initial_catalog","price_status":"provisional"}'::jsonb),
  ('knowledge-base-support','kb_support','AI Knowledge Base Support Agent','Business-trained support automation grounded in approved knowledge.',349,3350.40,'USD',true,true,'{"source":"initial_catalog","price_status":"provisional"}'::jsonb),
  ('social-dm-assistant','messaging_ai','AI Social DM & Messaging Assistant','AI conversations across connected social messaging channels.',299,2870.40,'USD',true,true,'{"source":"initial_catalog","price_status":"provisional"}'::jsonb)
ON CONFLICT(slug) DO UPDATE SET product_type=EXCLUDED.product_type,name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO public.product_prices(product,option_key,price,kind,active,metadata) VALUES
  ('ai_receptionist','web',99,'channel',true,'{"source":"initial_catalog"}'::jsonb),
  ('ai_receptionist','phone',148,'channel',true,'{"source":"initial_catalog"}'::jsonb),
  ('ai_receptionist','hybrid',178,'channel',true,'{"source":"initial_catalog"}'::jsonb),
  ('messaging_ai','whatsapp',20,'channel_addon',true,'{"source":"initial_catalog","is_add_on":true}'::jsonb),
  ('messaging_ai','messenger',20,'channel_addon',true,'{"source":"initial_catalog","is_add_on":true}'::jsonb),
  ('messaging_ai','instagram',20,'channel_addon',true,'{"source":"initial_catalog","is_add_on":true}'::jsonb),
  ('messaging_ai','telegram',20,'channel_addon',true,'{"source":"initial_catalog","is_add_on":true}'::jsonb),
  ('messaging_ai','sms',20,'channel_addon',true,'{"source":"initial_catalog","is_add_on":true}'::jsonb)
ON CONFLICT(product,option_key) DO UPDATE SET price=EXCLUDED.price,kind=EXCLUDED.kind,active=EXCLUDED.active;

INSERT INTO public.payment_methods(method_name,instructions,required_fields,is_card,is_active) VALUES
  ('Bank Transfer','Send payment using the bank transfer instructions shown by staff. Keep your transaction/reference number.','["sender_name","sender_phone","trx_id"]'::jsonb,false,true),
  ('Mobile Wallet','Send payment using the approved mobile-wallet details. Keep your transaction/reference number.','["sender_name","sender_phone","trx_id"]'::jsonb,false,true),
  ('Card','Card payments are handled through the configured secure provider.','["receipt"]'::jsonb,true,false)
ON CONFLICT DO NOTHING;
