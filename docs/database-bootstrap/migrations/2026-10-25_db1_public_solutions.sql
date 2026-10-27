-- Apply to existing external DB1.
-- Anonymous clients may read only the public site_solutions setting.
BEGIN;

GRANT SELECT (key, value) ON public.platform_settings TO anon;

DROP POLICY IF EXISTS platform_settings_public_solutions
  ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_public_solutions_guard
  ON public.platform_settings;

CREATE POLICY platform_settings_public_solutions
  ON public.platform_settings
  AS PERMISSIVE
  FOR SELECT TO anon
  USING (key = 'site_solutions');

-- Also constrain access if another permissive policy applies to anon.
CREATE POLICY platform_settings_public_solutions_guard
  ON public.platform_settings
  AS RESTRICTIVE
  FOR SELECT TO anon
  USING (key = 'site_solutions');

COMMIT;
