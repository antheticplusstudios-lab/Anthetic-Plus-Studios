CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.app_role AS ENUM ('client','verifier','admin','owner','partner');
CREATE TYPE public.automation_status AS ENUM ('paid','pending_payment','stopped','revoked','suspended','active');
CREATE TYPE public.payment_status AS ENUM ('pending','approved','rejected');

-- roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'client',
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','partner','admin'))
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','partner','admin','verifier'))
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "owners manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL DEFAULT '',
  company_email text NOT NULL DEFAULT '',
  website_url text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  profile_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- new user bootstrap: profile + client role; very first user becomes owner
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, company_email) VALUES (NEW.id, COALESCE(NEW.email,'')) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- automation instances
CREATE TABLE public.automation_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  automation_slug text NOT NULL,
  website_domain text NOT NULL DEFAULT '',
  status public.automation_status NOT NULL DEFAULT 'pending_payment',
  expires_at timestamptz,
  system_prompt text NOT NULL DEFAULT '',
  prompt_override text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  script_token text NOT NULL DEFAULT encode(gen_random_bytes(18),'hex'),
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  webhook_url text NOT NULL DEFAULT '',
  webhook_verified boolean NOT NULL DEFAULT false,
  business_context text NOT NULL DEFAULT '',
  billing_plan text NOT NULL DEFAULT 'monthly',
  origin text NOT NULL DEFAULT '',
  grace_days integer NOT NULL DEFAULT 3,
  killed boolean NOT NULL DEFAULT false,
  warning_sent boolean NOT NULL DEFAULT false,
  conversations_count integer NOT NULL DEFAULT 0,
  leads_count integer NOT NULL DEFAULT 0,
  provisioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX automation_instances_script_token_idx ON public.automation_instances(script_token);
CREATE INDEX automation_instances_user_idx ON public.automation_instances(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_instances TO authenticated;
GRANT ALL ON public.automation_instances TO service_role;
ALTER TABLE public.automation_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients read own" ON public.automation_instances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "clients create pending" ON public.automation_instances FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending_payment');
CREATE POLICY "clients update pending" ON public.automation_instances FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status IN ('pending_payment','stopped','suspended','revoked')) WITH CHECK (auth.uid() = user_id AND status IN ('pending_payment','stopped','suspended','revoked'));
CREATE POLICY "staff read all" ON public.automation_instances FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admins manage" ON public.automation_instances FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER ai_touch BEFORE UPDATE ON public.automation_instances FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.owns_automation(_automation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.automation_instances WHERE id = _automation_id AND user_id = auth.uid())
$$;

-- payments
CREATE TABLE public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  automation_id uuid REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  automation_slug text NOT NULL,
  billing_plan text NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL,
  transaction_id text NOT NULL,
  sender_name text NOT NULL,
  promo_code text,
  receipt_url text,
  origin text NOT NULL DEFAULT '',
  status public.payment_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_submissions_status_idx ON public.payment_submissions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_submissions TO authenticated;
GRANT ALL ON public.payment_submissions TO service_role;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own payments" ON public.payment_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "submit own payments" ON public.payment_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "staff read payments" ON public.payment_submissions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- simple catalog / config tables
CREATE TABLE public.pricing_plans (
  slug text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  yearly_discount_pct numeric NOT NULL DEFAULT 20,
  active boolean NOT NULL DEFAULT true,
  listed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_plans TO authenticated;
GRANT ALL ON public.pricing_plans TO service_role;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read plans" ON public.pricing_plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage plans" ON public.pricing_plans FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.pricing_plans (slug,name,monthly_price,listed) VALUES
 ('voice-sms-receptionist','AI Voice & SMS Receptionist',499,true),
 ('lead-capture-qualifier','AI Lead Capture & Smart Qualifier',299,false),
 ('knowledge-base-support','AI Knowledge Base Support Agent',349,false),
 ('social-dm-assistant','AI Social DM & Messaging Assistant',299,true),
 ('appointment-recovery','AI Appointment & No-Show Recovery',399,false),
 ('review-collector','AI Reputation & Review Collector',199,false);

CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  percent_off integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage promos" ON public.promo_codes FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_promo(_code text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT percent_off FROM public.promo_codes
  WHERE upper(code) = upper(trim(_code)) AND active AND (expires_at IS NULL OR expires_at > now()) LIMIT 1
$$;

CREATE TABLE public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_secrets TO authenticated;
GRANT ALL ON public.app_secrets TO service_role;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages secrets" ON public.app_secrets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.groq_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  key_value text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  cooldown_until timestamptz,
  error_count integer NOT NULL DEFAULT 0,
  request_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groq_keys TO authenticated;
GRANT ALL ON public.groq_keys TO service_role;
ALTER TABLE public.groq_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages groq" ON public.groq_keys FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.groq_failover_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid,
  status_code integer NOT NULL DEFAULT 0,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.groq_failover_log TO authenticated;
GRANT ALL ON public.groq_failover_log TO service_role;
ALTER TABLE public.groq_failover_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read failovers" ON public.groq_failover_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.global_prompts (
  key text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_prompts TO authenticated;
GRANT ALL ON public.global_prompts TO service_role;
ALTER TABLE public.global_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage prompts" ON public.global_prompts FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "staff write audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND actor_id = auth.uid());

CREATE TABLE public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invites TO authenticated;
GRANT ALL ON public.staff_invites TO service_role;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage invites" ON public.staff_invites FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.claim_staff_invite()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text; _inv record;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _inv FROM public.staff_invites WHERE lower(email) = _email AND status = 'pending' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _inv.role) ON CONFLICT DO NOTHING;
  UPDATE public.staff_invites SET status = 'accepted' WHERE id = _inv.id;
  RETURN _inv.role::text;
END $$;

CREATE TABLE public.client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_tags TO authenticated;
GRANT ALL ON public.client_tags TO service_role;
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tags" ON public.client_tags FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- per-automation data
CREATE TABLE public.automation_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT 'general',
  version_hash text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  visitor text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT '',
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '', summary text NOT NULL DEFAULT '', source text NOT NULL DEFAULT 'widget',
  lead_score integer NOT NULL DEFAULT 0, trace_id text NOT NULL DEFAULT '',
  webhook_status text NOT NULL DEFAULT '', webhook_response text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.appointment_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  visitor_name text NOT NULL DEFAULT '', visitor_email text NOT NULL DEFAULT '', visitor_phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '', external_ref text NOT NULL DEFAULT '', trace_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  weekday integer NOT NULL, start_minute integer NOT NULL, end_minute integer NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 30, timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tenant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  feature_key text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, feature_key)
);
CREATE TABLE public.ticket_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '', sentiment numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open', trace_id text NOT NULL DEFAULT '',
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb, visitor_contact text NOT NULL DEFAULT '',
  resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.widget_rate_limits (
  automation_id uuid PRIMARY KEY REFERENCES public.automation_instances(id) ON DELETE CASCADE,
  capacity integer NOT NULL DEFAULT 30,
  tokens numeric NOT NULL DEFAULT 30,
  refilled_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['automation_knowledge','transcripts','usage_logs','crm_leads','appointment_slots','availability_windows','tenant_features','ticket_escalations'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "owner reads" ON public.%I FOR SELECT TO authenticated USING (public.owns_automation(automation_id))', t);
    EXECUTE format('CREATE POLICY "staff read" ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "admins manage" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;
GRANT ALL ON public.widget_rate_limits TO service_role;
ALTER TABLE public.widget_rate_limits ENABLE ROW LEVEL SECURITY;

-- provisioning
CREATE OR REPLACE FUNCTION public.provision_automation(_automation_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid text; _plan text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT billing_plan, NULLIF(client_id,'') INTO _plan, _cid FROM public.automation_instances WHERE id = _automation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;
  _cid := COALESCE(_cid, 'ap_' || encode(gen_random_bytes(8),'hex'));
  UPDATE public.automation_instances SET
    status = 'active', killed = false, warning_sent = false, client_id = _cid,
    provisioned_at = now(),
    expires_at = GREATEST(COALESCE(expires_at, now()), now()) + CASE WHEN _plan = 'yearly' THEN interval '365 days' ELSE interval '30 days' END
  WHERE id = _automation_id;
  RETURN _cid;
END $$;

CREATE OR REPLACE FUNCTION public.review_payment(_payment_id uuid, _approve boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record; _email text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _p FROM public.payment_submissions WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'payment already reviewed'; END IF;
  IF NOT _approve AND COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'a reason is required to reject'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  UPDATE public.payment_submissions SET
    status = CASE WHEN _approve THEN 'approved'::payment_status ELSE 'rejected'::payment_status END,
    rejection_reason = CASE WHEN _approve THEN NULL ELSE _reason END,
    reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _payment_id;
  IF _approve AND _p.automation_id IS NOT NULL THEN
    UPDATE public.automation_instances SET billing_plan = _p.billing_plan WHERE id = _p.automation_id;
    PERFORM public.provision_automation(_p.automation_id);
  END IF;
  INSERT INTO public.audit_log (actor_id, actor_email, action, target, details)
  VALUES (auth.uid(), COALESCE(_email,''), CASE WHEN _approve THEN 'payment.approved' ELSE 'payment.rejected' END,
          _payment_id::text, jsonb_build_object('reason', _reason, 'amount', _p.amount));
END $$;

CREATE OR REPLACE FUNCTION public.run_subscription_lifecycle()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.automation_instances SET warning_sent = true
    WHERE status = 'active' AND NOT warning_sent AND expires_at IS NOT NULL AND expires_at < now() + interval '3 days';
  UPDATE public.automation_instances SET status = 'suspended'
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now();
  UPDATE public.automation_instances SET status = 'stopped'
    WHERE status = 'suspended' AND expires_at IS NOT NULL AND expires_at + make_interval(days => grace_days) < now();
END $$;

REVOKE EXECUTE ON FUNCTION public.provision_automation(uuid), public.review_payment(uuid,boolean,text), public.run_subscription_lifecycle(), public.claim_staff_invite() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.provision_automation(uuid), public.review_payment(uuid,boolean,text), public.run_subscription_lifecycle(), public.claim_staff_invite(), public.validate_promo(text), public.has_role(uuid,app_role), public.is_admin(uuid), public.is_staff(uuid), public.owns_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_subscription_lifecycle() TO service_role;