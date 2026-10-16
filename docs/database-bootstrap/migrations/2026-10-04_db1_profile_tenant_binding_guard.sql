-- Applied live 2026-10-04.
CREATE OR REPLACE FUNCTION public.protect_profile_identity_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_staff() THEN RETURN NEW; END IF;
  IF NEW.id <> OLD.id OR NEW.email <> OLD.email OR NEW.platform_role <> OLD.platform_role
     OR NEW.signup_origin <> OLD.signup_origin OR NEW.signup_domain IS DISTINCT FROM OLD.signup_domain
     OR NEW.is_active <> OLD.is_active OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'Protected profile fields can only be changed by platform staff';
  END IF;
  IF NEW.default_organization_id IS DISTINCT FROM OLD.default_organization_id
     AND NEW.default_organization_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id=NEW.id AND om.organization_id=NEW.default_organization_id AND om.is_active=true) THEN
    RAISE EXCEPTION 'default_organization_id must reference an active organization membership';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_identity_fields() FROM PUBLIC, anon, authenticated;
