-- DB1 tenant-binding hardening.
-- Client-side profile updates must never be able to repoint tenant ownership fields.
-- The auth trigger/service role is intentionally exempt; it creates the membership first.

CREATE OR REPLACE FUNCTION public.guard_profile_tenant_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'client_id is not user-editable';
    END IF;

    IF NEW.default_organization_id IS DISTINCT FROM OLD.default_organization_id THEN
      IF NEW.default_organization_id IS NULL THEN
        -- Allow clearing the preference; application authorization falls back to an active membership.
        NULL;
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = NEW.default_organization_id
          AND user_id = auth.uid()
          AND is_active
      ) THEN
        RAISE EXCEPTION 'default_organization_id must reference an active membership';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_tenant_binding ON public.profiles;
CREATE TRIGGER profiles_guard_tenant_binding
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_tenant_binding();
