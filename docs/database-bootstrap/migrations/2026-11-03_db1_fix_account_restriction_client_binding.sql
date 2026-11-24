-- DB1 hotfix: keep the required account_restrictions.client_id aligned
-- with the user's default organization. Apply only to the dedicated AUTH DB1.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin_domain text;
  v_signup_origin public.signup_origin_type;
  v_org_id uuid;
  v_slug text;
  v_name text;
BEGIN
  v_origin_domain := lower(nullif(trim(coalesce(
    NEW.raw_user_meta_data->>'origin_domain',
    NEW.raw_user_meta_data->>'signup_domain',
    ''
  )), ''));

  BEGIN
    v_signup_origin := coalesce(NEW.raw_user_meta_data->>'signup_origin', 'other')::public.signup_origin_type;
  EXCEPTION WHEN invalid_text_representation THEN
    v_signup_origin := 'other';
  END;

  v_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(NEW.email, '@', 1), ''),
    'New Client'
  );
  v_slug := regexp_replace(
    lower(coalesce(split_part(NEW.email, '@', 1), 'client')) || '-' || substr(NEW.id::text, 1, 8),
    '[^a-z0-9-]+',
    '-',
    'g'
  );

  INSERT INTO public.organizations(
    name, slug, signup_origin, origin_domain, owner_user_id, created_by_user_id
  )
  VALUES (v_name, v_slug, v_signup_origin, v_origin_domain, NEW.id, NEW.id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles(
    id, email, full_name, avatar_url, platform_role, signup_origin, signup_domain,
    default_organization_id, client_id, registered_origin_domain, is_active
  )
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    'client',
    v_signup_origin,
    v_origin_domain,
    v_org_id,
    v_org_id,
    v_origin_domain,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    default_organization_id = coalesce(public.profiles.default_organization_id, EXCLUDED.default_organization_id),
    client_id = coalesce(public.profiles.client_id, EXCLUDED.client_id),
    registered_origin_domain = coalesce(public.profiles.registered_origin_domain, EXCLUDED.registered_origin_domain),
    updated_at = now();

  INSERT INTO public.organization_members(organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET is_active = true;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT DO NOTHING;

  -- client_id is NOT NULL and uniquely identifies the tenant restriction row.
  INSERT INTO public.account_restrictions(user_id, client_id)
  VALUES (NEW.id, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET client_id = coalesce(public.account_restrictions.client_id, EXCLUDED.client_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_user(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  IF public.has_platform_role(p_target_user_id, 'owner') THEN RAISE EXCEPTION 'owner accounts cannot be moderated'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'a reason is required'; END IF;

  SELECT p.default_organization_id, lower(o.origin_domain)
    INTO v_target_client, v_target_domain
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.default_organization_id
  WHERE p.id = p_target_user_id;

  IF v_target_client IS NULL THEN
    RAISE EXCEPTION 'target user organization not found';
  END IF;

  IF public.has_platform_role(p_actor_user_id, 'partner')
     AND NOT public.is_super_admin(p_actor_user_id) THEN
    SELECT lower(o.origin_domain) INTO v_actor_domain
    FROM public.profiles p
    LEFT JOIN public.organizations o ON o.id = p.default_organization_id
    WHERE p.id = p_actor_user_id;

    IF coalesce(v_actor_domain, '') = ''
       OR v_actor_domain IS DISTINCT FROM coalesce(v_target_domain, '') THEN
      RAISE EXCEPTION 'outside partner scope';
    END IF;
  END IF;

  INSERT INTO public.account_restrictions(user_id, client_id)
  VALUES (p_target_user_id, v_target_client)
  ON CONFLICT (user_id) DO UPDATE
    SET client_id = coalesce(public.account_restrictions.client_id, EXCLUDED.client_id);

  SELECT to_jsonb(r), r.status, r.muted
    INTO v_before, v_status, v_muted
  FROM public.account_restrictions r
  WHERE r.user_id = p_target_user_id;

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
  SET status = v_status,
      muted = v_muted,
      reason = p_reason,
      sessions_revoked_at = CASE
        WHEN p_action IN ('suspend', 'ban', 'deactivate', 'force_signout') THEN now()
        ELSE sessions_revoked_at
      END,
      updated_by = p_actor_user_id,
      updated_at = now()
  WHERE user_id = p_target_user_id;

  SELECT to_jsonb(r) INTO v_after
  FROM public.account_restrictions r
  WHERE r.user_id = p_target_user_id;

  INSERT INTO public.audit_logs(
    actor_user_id, client_id, action, target_type, target_id, reason,
    before_value, after_value, metadata
  )
  VALUES (
    p_actor_user_id, v_target_client, 'user.' || p_action, 'user',
    p_target_user_id, p_reason, v_before, v_after,
    jsonb_build_object('action', p_action)
  );

  RETURN v_after;
END;
$$;

COMMIT;
