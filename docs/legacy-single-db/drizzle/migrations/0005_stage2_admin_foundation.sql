-- ========== Account restrictions ==========
CREATE TABLE public.account_restrictions (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned','deactivated')),
  muted boolean NOT NULL DEFAULT false,
  reason text,
  sessions_revoked_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_restrictions TO authenticated;
GRANT ALL ON public.account_restrictions TO service_role;
ALTER TABLE public.account_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_read ON public.account_restrictions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_blocked(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_restrictions r WHERE r.user_id = _uid AND (
    r.status <> 'active'
    OR (r.sessions_revoked_at IS NOT NULL AND _uid = auth.uid()
        AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint, 0)) < r.sessions_revoked_at)))
$$;
CREATE OR REPLACE FUNCTION public.is_muted(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_restrictions WHERE user_id = _uid AND muted)
$$;
CREATE OR REPLACE FUNCTION public.my_account_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'status', COALESCE(r.status,'active'), 'muted', COALESCE(r.muted,false), 'reason', r.reason,
    'session_revoked', (r.sessions_revoked_at IS NOT NULL AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0)) < r.sessions_revoked_at))
  FROM (SELECT 1) x LEFT JOIN public.account_restrictions r ON r.user_id = auth.uid()
$$;

-- Database enforcement: blocked users cannot write, muted users cannot write content
CREATE POLICY ca_not_blocked ON public.client_automations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_blocked(auth.uid()) AND (public.is_admin(auth.uid()) OR NOT public.is_muted(auth.uid())));
CREATE POLICY kb_not_blocked_ins ON public.kb_documents AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_blocked(auth.uid()) AND NOT public.is_muted(auth.uid()));
CREATE POLICY kb_not_blocked_del ON public.kb_documents AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_blocked(auth.uid()));
CREATE POLICY at_not_blocked ON public.automation_tasks AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_blocked(auth.uid())) WITH CHECK (NOT public.is_blocked(auth.uid()));
CREATE POLICY prof_not_blocked ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_blocked(auth.uid()));
CREATE POLICY cj_not_blocked ON public.crawl_jobs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_blocked(auth.uid()));

-- Protect identity/tenancy columns on profiles
CREATE OR REPLACE FUNCTION public.profiles_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.registered_origin_domain IS DISTINCT FROM OLD.registered_origin_domain THEN
      RAISE EXCEPTION 'These account fields cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

-- Signup origin captured from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, company_email, registered_origin_domain)
  VALUES (NEW.id, COALESCE(NEW.email,''), lower(COALESCE(NEW.raw_user_meta_data->>'origin_domain','')))
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Admin moderation RPC
CREATE OR REPLACE FUNCTION public.admin_moderate_user(_user uuid, _action text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _before jsonb; _after jsonb; _origin text; _new_status text; _muted boolean;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _user = auth.uid() THEN RAISE EXCEPTION 'you cannot moderate your own account'; END IF;
  IF public.has_role(_user,'owner') THEN RAISE EXCEPTION 'owner accounts cannot be moderated'; END IF;
  IF NOT public.has_role(auth.uid(),'owner') THEN
    SELECT registered_origin_domain INTO _origin FROM public.profiles WHERE user_id = _user;
    IF _origin IS DISTINCT FROM public.my_origin_domain() OR public.is_admin(_user) THEN RAISE EXCEPTION 'outside your partner scope'; END IF;
  END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'a reason is required'; END IF;
  INSERT INTO public.account_restrictions (user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT to_jsonb(r) INTO _before FROM public.account_restrictions r WHERE user_id = _user;
  SELECT status, muted INTO _new_status, _muted FROM public.account_restrictions WHERE user_id = _user;
  CASE _action
    WHEN 'suspend' THEN _new_status := 'suspended';
    WHEN 'unsuspend' THEN IF _new_status = 'suspended' THEN _new_status := 'active'; END IF;
    WHEN 'ban' THEN _new_status := 'banned';
    WHEN 'unban' THEN IF _new_status = 'banned' THEN _new_status := 'active'; END IF;
    WHEN 'deactivate' THEN _new_status := 'deactivated';
    WHEN 'activate' THEN _new_status := 'active';
    WHEN 'mute' THEN _muted := true;
    WHEN 'unmute' THEN _muted := false;
    WHEN 'force_signout' THEN NULL;
    ELSE RAISE EXCEPTION 'unknown action';
  END CASE;
  UPDATE public.account_restrictions SET status = _new_status, muted = _muted, reason = _reason,
    sessions_revoked_at = CASE WHEN _action IN ('force_signout','suspend','ban','deactivate') THEN now() ELSE sessions_revoked_at END,
    updated_by = auth.uid(), updated_at = now()
  WHERE user_id = _user;
  SELECT to_jsonb(r) INTO _after FROM public.account_restrictions r WHERE user_id = _user;
  INSERT INTO public.audit_logs (event_type, actor, target_type, target_id, reason, before_value, after_value, changed_fields, client_id)
  VALUES ('user.' || _action, auth.uid(), 'user', _user::text, _reason, _before, _after, jsonb_build_object('action', _action),
          (SELECT client_id FROM public.profiles WHERE user_id = _user));
  RETURN _after;
END $$;

-- ========== Automation lifecycle columns ==========
ALTER TABLE public.client_automations
  ADD COLUMN IF NOT EXISTS run_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS installed_at timestamptz;
UPDATE public.client_automations SET run_state = CASE WHEN is_active THEN 'active' ELSE 'disabled' END;
UPDATE public.client_automations SET expires_at = created_at + interval '30 days' WHERE expires_at IS NULL;
ALTER TABLE public.client_automations ADD CONSTRAINT ca_run_state_check CHECK (run_state IN ('active','paused','stopped','disabled','suspended'));

-- Canonical runtime gate used by widget, health and future channels
CREATE OR REPLACE FUNCTION public.automation_runtime_state(_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN a.id IS NULL THEN 'missing'
    WHEN a.run_state <> 'active' THEN a.run_state
    WHEN NOT a.is_active THEN 'disabled'
    WHEN a.expires_at IS NOT NULL AND a.expires_at < now() THEN 'expired'
    WHEN EXISTS (SELECT 1 FROM public.profiles p JOIN public.account_restrictions r ON r.user_id = p.user_id
                 WHERE p.client_id = a.client_id AND r.status <> 'active') THEN 'owner_restricted'
    ELSE 'active' END
  FROM (SELECT 1) x LEFT JOIN public.client_automations a ON a.id = _id
$$;

-- Script generation records
CREATE TABLE public.script_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  token_hint text NOT NULL,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidated_reason text
);
GRANT SELECT ON public.script_generations TO authenticated;
GRANT ALL ON public.script_generations TO service_role;
ALTER TABLE public.script_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY sg_read ON public.script_generations FOR SELECT TO authenticated USING (public.can_manage_client_automation(automation_id));

CREATE OR REPLACE FUNCTION public.admin_generate_script(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tok text; _cid text;
BEGIN
  IF NOT public.can_manage_client_automation(_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT script_token, client_id INTO _tok, _cid FROM public.client_automations WHERE id = _id;
  INSERT INTO public.script_generations (automation_id, token_hint, generated_by) VALUES (_id, right(_tok, 6), auth.uid());
  INSERT INTO public.audit_logs (automation_id, event_type, actor, target_type, target_id, changed_fields, client_id)
  VALUES (_id, 'script.generated', auth.uid(), 'automation', _id::text, jsonb_build_object('token_hint', right(_tok,6)), _cid);
  RETURN _tok;
END $$;

CREATE OR REPLACE FUNCTION public.admin_automation_action(_id uuid, _action text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _before jsonb; _after jsonb; _a record;
BEGIN
  IF NOT public.can_manage_client_automation(_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _a FROM public.client_automations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;
  IF _action IN ('disable','stop','pause','rotate_token','rotate_hmac','reinstall') AND COALESCE(trim(_reason),'') = '' THEN
    RAISE EXCEPTION 'a reason is required for this action'; END IF;
  _before := jsonb_build_object('run_state', _a.run_state, 'is_active', _a.is_active, 'token_hint', right(_a.script_token,6), 'requires_reinstallation', _a.requires_reinstallation);
  CASE _action
    WHEN 'enable' THEN UPDATE public.client_automations SET run_state='active', is_active=true WHERE id=_id;
    WHEN 'resume' THEN UPDATE public.client_automations SET run_state='active', is_active=true WHERE id=_id;
    WHEN 'disable' THEN UPDATE public.client_automations SET run_state='disabled', is_active=false WHERE id=_id;
    WHEN 'pause' THEN UPDATE public.client_automations SET run_state='paused', is_active=false WHERE id=_id;
    WHEN 'stop' THEN UPDATE public.client_automations SET run_state='stopped', is_active=false WHERE id=_id;
    WHEN 'rotate_token', 'reinstall' THEN
      UPDATE public.script_generations SET invalidated_at = now(), invalidated_reason = _action WHERE automation_id=_id AND invalidated_at IS NULL;
      UPDATE public.client_automations SET script_token = encode(gen_random_bytes(16),'hex'), requires_reinstallation = true, installed_at = NULL WHERE id=_id;
      IF _action = 'reinstall' THEN INSERT INTO public.crawl_jobs (automation_id, target_url) VALUES (_id, _a.domain_url); END IF;
    WHEN 'rotate_hmac' THEN
      UPDATE public.script_generations SET invalidated_at = now(), invalidated_reason = 'rotate_hmac' WHERE automation_id=_id AND invalidated_at IS NULL;
      UPDATE public.client_automations SET hmac_key = encode(gen_random_bytes(32),'hex') WHERE id=_id;
    ELSE RAISE EXCEPTION 'unknown action';
  END CASE;
  SELECT jsonb_build_object('run_state', run_state, 'is_active', is_active, 'token_hint', right(script_token,6), 'requires_reinstallation', requires_reinstallation)
    INTO _after FROM public.client_automations WHERE id=_id;
  INSERT INTO public.audit_logs (automation_id, event_type, actor, target_type, target_id, reason, before_value, after_value, changed_fields, client_id)
  VALUES (_id, 'automation.' || _action, auth.uid(), 'automation', _id::text, _reason, _before, _after, jsonb_build_object('action',_action), _a.client_id);
  RETURN _after;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_widget_config(_id uuid, _config jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _before jsonb; _cid text;
BEGIN
  IF NOT public.can_manage_client_automation(_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF jsonb_typeof(_config) <> 'object' OR length(_config::text) > 20000 THEN RAISE EXCEPTION 'invalid config'; END IF;
  SELECT widget_config, client_id INTO _before, _cid FROM public.client_automations WHERE id=_id;
  UPDATE public.client_automations SET widget_config = _config WHERE id=_id;
  INSERT INTO public.audit_logs (automation_id, event_type, actor, target_type, target_id, before_value, after_value, changed_fields, client_id)
  VALUES (_id, 'widget.config_updated', auth.uid(), 'automation', _id::text, _before, _config, '{}'::jsonb, _cid);
END $$;

-- ========== Health ==========
CREATE TABLE public.automation_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','warn','fail','skip')),
  latency_ms integer,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ahc_auto_idx ON public.automation_health_checks(automation_id, checked_at DESC);
CREATE TABLE public.automation_health_state (
  automation_id uuid NOT NULL REFERENCES public.client_automations(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  status text NOT NULL,
  latency_ms integer,
  last_error text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  recovered_at timestamptz,
  PRIMARY KEY (automation_id, check_type)
);
CREATE TABLE public.automation_health (
  automation_id uuid PRIMARY KEY REFERENCES public.client_automations(id) ON DELETE CASCADE,
  overall text NOT NULL,
  summary text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_health_checks, public.automation_health_state, public.automation_health TO authenticated;
GRANT ALL ON public.automation_health_checks, public.automation_health_state, public.automation_health TO service_role;
ALTER TABLE public.automation_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_health_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY ahc_read ON public.automation_health_checks FOR SELECT TO authenticated USING (public.can_manage_client_automation(automation_id) OR public.owns_client_automation(automation_id));
CREATE POLICY ahs_read ON public.automation_health_state FOR SELECT TO authenticated USING (public.can_manage_client_automation(automation_id) OR public.owns_client_automation(automation_id));
CREATE POLICY ah_read ON public.automation_health FOR SELECT TO authenticated USING (public.can_manage_client_automation(automation_id) OR public.owns_client_automation(automation_id));

-- place_order: blocked/muted users cannot order
CREATE OR REPLACE FUNCTION public.assert_not_blocked() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF public.is_blocked(auth.uid()) THEN RAISE EXCEPTION 'your account is restricted'; END IF; END $$;
CREATE POLICY orders_not_blocked ON public.orders AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_blocked(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.admin_moderate_user(uuid,text,text), public.admin_automation_action(uuid,text,text),
  public.admin_generate_script(uuid), public.admin_update_widget_config(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_user(uuid,text,text), public.admin_automation_action(uuid,text,text),
  public.admin_generate_script(uuid), public.admin_update_widget_config(uuid,jsonb), public.my_account_status(),
  public.is_blocked(uuid), public.is_muted(uuid), public.automation_runtime_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.automation_runtime_state(uuid) TO service_role;