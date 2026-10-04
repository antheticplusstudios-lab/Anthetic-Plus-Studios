-- AntheticPlus DB1: app_auth
-- Run only on the dedicated AUTH / IDENTITY Supabase project.
-- Canonical IDs: user_id = auth.users.id; organization_id = client_id = organizations.id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.signup_origin_type AS ENUM ('antheticplus','partner','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('client','partner','staff','verifier','admin','owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.organization_member_role AS ENUM ('owner','admin','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.account_restriction_status AS ENUM ('active','suspended','banned','deactivated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.outbox_status AS ENUM ('pending','processing','processed','retryable','dead_letter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  signup_origin public.signup_origin_type NOT NULL DEFAULT 'other',
  origin_domain text,
  partner_source_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid,
  email text NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  default_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.organization_member_role NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.platform_role NOT NULL DEFAULT 'client',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.account_restrictions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.account_restriction_status NOT NULL DEFAULT 'active',
  muted boolean NOT NULL DEFAULT false,
  reason text,
  muted_reason text,
  sessions_revoked_at timestamptz,
  restricted_until timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_super_admin boolean NOT NULL DEFAULT false,
  can_manage_users boolean NOT NULL DEFAULT false,
  can_manage_payments boolean NOT NULL DEFAULT false,
  can_manage_automations boolean NOT NULL DEFAULT false,
  can_manage_ai boolean NOT NULL DEFAULT false,
  can_manage_crm boolean NOT NULL DEFAULT false,
  can_manage_integrations boolean NOT NULL DEFAULT false,
  can_view_audit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  requested_role public.platform_role NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  client_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  reason text,
  before_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE INDEX IF NOT EXISTS organizations_origin_idx ON public.organizations(signup_origin, origin_domain);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON public.organization_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS account_restrictions_status_idx ON public.account_restrictions(status, muted);
CREATE INDEX IF NOT EXISTS audit_logs_client_created_idx ON public.audit_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON public.audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_user_idx ON public.user_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outbox_queue_idx ON public.outbox_events(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retryable','processing');

DROP TRIGGER IF EXISTS organizations_touch_updated_at ON public.organizations;
CREATE TRIGGER organizations_touch_updated_at BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS organization_members_touch_updated_at ON public.organization_members;
CREATE TRIGGER organization_members_touch_updated_at BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS account_restrictions_touch_updated_at ON public.account_restrictions;
CREATE TRIGGER account_restrictions_touch_updated_at BEFORE UPDATE ON public.account_restrictions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS staff_permissions_touch_updated_at ON public.staff_permissions;
CREATE TRIGGER staff_permissions_touch_updated_at BEFORE UPDATE ON public.staff_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS feature_flags_touch_updated_at ON public.feature_flags;
CREATE TRIGGER feature_flags_touch_updated_at BEFORE UPDATE ON public.feature_flags
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS platform_settings_touch_updated_at ON public.platform_settings;
CREATE TRIGGER platform_settings_touch_updated_at BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.has_platform_role(p_user_id uuid, p_role public.platform_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role IN ('owner','admin','staff','verifier')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.staff_permissions WHERE user_id = p_user_id AND is_super_admin
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_client_id AND user_id = p_user_id AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_user_id uuid, p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_client_id AND user_id = p_user_id
      AND role IN ('owner','admin') AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_blocked(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_restrictions r
    WHERE r.user_id = p_user_id
      AND r.status <> 'active'
      AND (r.restricted_until IS NULL OR r.restricted_until > now())
  );
$$;

-- More precise blocked predicate; this function is used by application authorization.
CREATE OR REPLACE FUNCTION public.account_is_restricted(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_restrictions r
    WHERE r.user_id = p_user_id
      AND r.status <> 'active'
      AND (r.restricted_until IS NULL OR r.restricted_until > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.account_is_muted(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT muted FROM public.account_restrictions WHERE user_id = p_user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.my_account_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'status', COALESCE(r.status::text,'active'),
    'muted', COALESCE(r.muted,false),
    'reason', r.reason,
    'sessions_revoked_at', r.sessions_revoked_at,
    'restricted_until', r.restricted_until
  )
  FROM (SELECT 1) x
  LEFT JOIN public.account_restrictions r ON r.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_user(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_target_client uuid;
  v_target_domain text;
  v_actor_domain text;
  v_status public.account_restriction_status;
  v_muted boolean;
BEGIN
  IF NOT public.is_platform_admin(p_actor_user_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_actor_user_id = p_target_user_id THEN RAISE EXCEPTION 'cannot moderate your own account'; END IF;
  IF public.has_platform_role(p_target_user_id,'owner') THEN RAISE EXCEPTION 'owner accounts cannot be moderated'; END IF;
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'a reason is required'; END IF;

  SELECT p.default_organization_id, lower(o.origin_domain)
    INTO v_target_client, v_target_domain
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.default_organization_id
  WHERE p.id = p_target_user_id;

  IF public.has_platform_role(p_actor_user_id,'partner') AND NOT public.is_super_admin(p_actor_user_id) THEN
    SELECT lower(o.origin_domain) INTO v_actor_domain
    FROM public.profiles p
    LEFT JOIN public.organizations o ON o.id = p.default_organization_id
    WHERE p.id = p_actor_user_id;
    IF COALESCE(v_actor_domain,'') = '' OR v_actor_domain IS DISTINCT FROM COALESCE(v_target_domain,'') THEN
      RAISE EXCEPTION 'outside partner scope';
    END IF;
  END IF;

  INSERT INTO public.account_restrictions(user_id) VALUES(p_target_user_id) ON CONFLICT DO NOTHING;
  SELECT to_jsonb(r), r.status, r.muted INTO v_before, v_status, v_muted
  FROM public.account_restrictions r WHERE r.user_id=p_target_user_id;

  CASE p_action
    WHEN 'suspend' THEN v_status := 'suspended';
    WHEN 'unsuspend' THEN v_status := 'active';
    WHEN 'ban' THEN v_status := 'banned';
    WHEN 'unban' THEN v_status := 'active';
    WHEN 'deactivate' THEN v_status := 'deactivated';
    WHEN 'activate' THEN v_status := 'active';
    WHEN 'mute' THEN v_muted := true;
    WHEN 'unmute' THEN v_muted := false;
    WHEN 'force_signout' THEN NULL;
    ELSE RAISE EXCEPTION 'unknown action';
  END CASE;

  UPDATE public.account_restrictions
  SET status=v_status, muted=v_muted, reason=p_reason,
      sessions_revoked_at=CASE WHEN p_action IN ('suspend','ban','deactivate','force_signout') THEN now() ELSE sessions_revoked_at END,
      updated_by=p_actor_user_id, updated_at=now()
  WHERE user_id=p_target_user_id;

  SELECT to_jsonb(r) INTO v_after FROM public.account_restrictions r WHERE r.user_id=p_target_user_id;
  INSERT INTO public.audit_logs(actor_user_id,client_id,action,target_type,target_id,reason,before_value,after_value,metadata)
  VALUES(p_actor_user_id,v_target_client,'user.'||p_action,'user',p_target_user_id,p_reason,v_before,v_after,jsonb_build_object('action',p_action));
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_guard_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'identity fields cannot be changed here';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_guard_identity ON public.profiles;
CREATE TRIGGER profiles_guard_identity BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_identity();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin_domain text;
  v_signup_origin public.signup_origin_type;
  v_org_id uuid;
  v_slug text;
  v_name text;
BEGIN
  v_origin_domain := lower(NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'origin_domain','')), ''));
  BEGIN
    v_signup_origin := (COALESCE(NEW.raw_user_meta_data->>'signup_origin','other'))::public.signup_origin_type;
  EXCEPTION WHEN invalid_text_representation THEN
    v_signup_origin := 'other';
  END;

  v_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'company_name'),''), NULLIF(trim(NEW.raw_user_meta_data->>'full_name'),''), 'New Client');
  v_slug := regexp_replace(lower(COALESCE(split_part(NEW.email,'@',1), 'client')) || '-' || substr(NEW.id::text,1,8), '[^a-z0-9-]+', '-', 'g');

  INSERT INTO public.organizations (name, slug, signup_origin, origin_domain, created_by_user_id)
  VALUES (v_name, v_slug, v_signup_origin, v_origin_domain, NEW.id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (id, email, full_name, default_organization_id)
  VALUES (NEW.id, COALESCE(NEW.email,''), NULLIF(trim(NEW.raw_user_meta_data->>'full_name'),''), v_org_id)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, default_organization_id = COALESCE(public.profiles.default_organization_id, EXCLUDED.default_organization_id);

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  INSERT INTO public.account_restrictions (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.enqueue_outbox(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.outbox_events(event_type, aggregate_type, aggregate_id, idempotency_key, payload)
  VALUES (p_event_type, p_aggregate_type, p_aggregate_id, p_idempotency_key, COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_user_created_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org_id uuid; v_origin text; v_signup text;
BEGIN
  SELECT id, lower(origin_domain), signup_origin::text INTO v_org_id, v_origin, v_signup
  FROM public.organizations WHERE created_by_user_id=NEW.id ORDER BY created_at DESC LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    PERFORM public.enqueue_outbox(
      'user.created','user',NEW.id,'user.created:' || NEW.id::text,
      jsonb_build_object('user_id',NEW.id,'organization_id',v_org_id,'client_id',v_org_id,'email',NEW.email,'signup_origin',v_signup,'origin_domain',v_origin)
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS after_profile_user_created_outbox ON public.profiles;
CREATE TRIGGER after_profile_user_created_outbox AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enqueue_user_created_event();

CREATE OR REPLACE FUNCTION public.claim_outbox_events(p_worker_id text, p_batch_size integer)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.outbox_events
    WHERE (
      status = 'pending'
      OR (status = 'retryable' AND next_attempt_at <= now())
      OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
    )
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, p_batch_size)
  )
  UPDATE public.outbox_events e
  SET status = 'processing', locked_by = p_worker_id, locked_at = now(), attempt_count = e.attempt_count + 1
  FROM picked
  WHERE e.id = picked.id
  RETURNING e.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_outbox_event(p_event_id uuid, p_worker_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.outbox_events
  SET status='processed', processed_at=now(), locked_by=NULL, locked_at=NULL, last_error=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(p_event_id uuid, p_worker_id text, p_error text, p_retry_at timestamptz, p_dead_letter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.outbox_events
  SET status = CASE WHEN p_dead_letter THEN 'dead_letter' ELSE 'retryable' END,
      last_error = left(COALESCE(p_error,''), 4000),
      next_attempt_at = COALESCE(p_retry_at, now() + interval '5 minutes'),
      locked_by=NULL, locked_at=NULL
  WHERE id=p_event_id AND (locked_by=p_worker_id OR locked_by IS NULL);
END;
$$;

-- Single-use owner bootstrap; callable only by server/service_role, not the browser.
CREATE OR REPLACE FUNCTION public.bootstrap_first_owner(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role='owner') THEN
    RAISE EXCEPTION 'an owner already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, 'owner') ON CONFLICT DO NOTHING;
  UPDATE public.organization_members SET role='owner' WHERE user_id=p_user_id;
  INSERT INTO public.staff_permissions(user_id, is_super_admin, can_manage_users, can_manage_payments, can_manage_automations, can_manage_ai, can_manage_crm, can_manage_integrations, can_view_audit)
  VALUES (p_user_id, true, true, true, true, true, true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET is_super_admin=true, can_manage_users=true, can_manage_payments=true, can_manage_automations=true, can_manage_ai=true, can_manage_crm=true, can_manage_integrations=true, can_view_audit=true;
END;
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), id) OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS organizations_update ON public.organizations;
CREATE POLICY organizations_update ON public.organizations FOR UPDATE TO authenticated
USING (public.is_org_admin(auth.uid(), id) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_org_admin(auth.uid(), id) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() AND NOT public.account_is_restricted(auth.uid()))
WITH CHECK (id = auth.uid() AND NOT public.account_is_restricted(auth.uid()));

DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
CREATE POLICY organization_members_select ON public.organization_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS account_restrictions_select ON public.account_restrictions;
CREATE POLICY account_restrictions_select ON public.account_restrictions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS staff_invites_staff ON public.staff_invites;
CREATE POLICY staff_invites_staff ON public.staff_invites FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS feature_flags_staff ON public.feature_flags;
CREATE POLICY feature_flags_staff ON public.feature_flags FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_settings_staff ON public.platform_settings;
CREATE POLICY platform_settings_staff ON public.platform_settings FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS audit_logs_staff ON public.audit_logs;
CREATE POLICY audit_logs_staff ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR client_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id=auth.uid() AND is_active
));

DROP POLICY IF EXISTS user_activity_self_or_staff ON public.user_activity_events;
CREATE POLICY user_activity_self_or_staff ON public.user_activity_events FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_platform_admin(auth.uid()));

-- Never expose DB1 platform internals directly to anonymous clients.
REVOKE ALL ON public.account_restrictions, public.staff_permissions, public.outbox_events, public.processed_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs, public.user_activity_events FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.organizations, public.profiles, public.organization_members, public.user_roles, public.account_restrictions, public.staff_invites, public.feature_flags, public.platform_settings, public.audit_logs, public.user_activity_events TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_platform_role(uuid, public.platform_role), public.is_platform_admin(uuid), public.is_super_admin(uuid), public.is_org_member(uuid,uuid), public.is_org_admin(uuid,uuid), public.is_blocked(uuid), public.account_is_restricted(uuid), public.account_is_muted(uuid), public.my_account_status(), public.admin_moderate_user(uuid,uuid,text,text), public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean), public.bootstrap_first_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_platform_role(uuid, public.platform_role), public.is_platform_admin(uuid), public.is_super_admin(uuid), public.is_org_member(uuid,uuid), public.is_org_admin(uuid,uuid), public.is_blocked(uuid), public.account_is_restricted(uuid), public.account_is_muted(uuid), public.my_account_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_user(uuid,uuid,text,text), public.enqueue_outbox(text,text,uuid,text,jsonb), public.claim_outbox_events(text,integer), public.complete_outbox_event(uuid,text), public.fail_outbox_event(uuid,text,text,timestamptz,boolean), public.bootstrap_first_owner(uuid) TO service_role;

-- Default feature state used by runtime. FastAPI also checks this flag server-side.
INSERT INTO public.feature_flags(key, description, is_enabled)
VALUES ('public_widget', 'Allow public automation widgets to operate globally.', true)
ON CONFLICT (key) DO NOTHING;


-- Compatibility RPCs used by existing server functions.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.is_super_admin(_user_id) OR public.has_platform_role(_user_id,'partner');
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.is_platform_admin(_user_id) OR public.has_platform_role(_user_id,'partner');
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text=_role);
$$;
CREATE OR REPLACE FUNCTION public.is_muted(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.account_is_muted(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.my_origin_domain(_user_id uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT lower(o.origin_domain) FROM public.profiles p LEFT JOIN public.organizations o ON o.id=p.default_organization_id WHERE p.id=_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid), public.is_staff(uuid), public.has_role(uuid,text), public.is_muted(uuid), public.my_origin_domain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid), public.is_staff(uuid), public.has_role(uuid,text), public.is_muted(uuid), public.my_origin_domain(uuid) TO authenticated;

-- Application profile compatibility/read-model fields used by the existing dashboard until the
-- final UI migration is complete. These stay in DB1; downstream databases never depend on them.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registered_origin_domain text;
CREATE INDEX IF NOT EXISTS profiles_origin_domain_idx ON public.profiles(registered_origin_domain);

CREATE OR REPLACE FUNCTION public.sync_profile_compatibility_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.user_id := NEW.id;
  IF NEW.client_id IS NULL THEN NEW.client_id := NEW.default_organization_id; END IF;
  IF NEW.company_email IS NULL OR NEW.company_email = '' THEN NEW.company_email := NEW.email; END IF;
  IF NEW.registered_origin_domain IS NULL AND NEW.default_organization_id IS NOT NULL THEN
    SELECT origin_domain INTO NEW.registered_origin_domain
    FROM public.organizations WHERE id = NEW.default_organization_id;
  END IF;
  NEW.profile_completed := (
    coalesce(trim(NEW.full_name),'') <> '' AND
    coalesce(trim(NEW.company_name),'') <> '' AND
    coalesce(trim(NEW.company_email),'') <> '' AND
    coalesce(trim(NEW.website_url),'') <> '' AND
    coalesce(trim(NEW.category),'') <> ''
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_sync_compatibility ON public.profiles;
CREATE TRIGGER trg_profiles_sync_compatibility
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_compatibility_fields();

-- A compatibility table for the public settings hook. Platform control remains DB1-only.
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_settings_public_read ON public.system_settings;
CREATE POLICY system_settings_public_read ON public.system_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS system_settings_staff_write ON public.system_settings;
CREATE POLICY system_settings_staff_write ON public.system_settings FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


-- Final hardening/seed pass.
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;

INSERT INTO public.feature_flags(key, description, is_enabled) VALUES
  ('public_widget','Allow public automation widgets to operate globally.',true),
  ('public_storefront','Allow new customer orders from the public storefront.',true),
  ('test_chat','Allow clients to test their automation from the dashboard.',true),
  ('transcript_evaluator','Allow conversation AI evaluation.',true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings(key,value) VALUES
  ('maintenance', '{"enabled":false,"message":""}'::jsonb),
  ('banner', '{"enabled":false,"message":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;
