-- Run this on DB1 after the first real account has been created.
-- Replace the email before executing. This script is intentionally not idempotent.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('REPLACE_WITH_OWNER_EMAIL@example.com');

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Owner email not found. Replace the placeholder and rerun.';
  END IF;

  PERFORM public.bootstrap_first_owner(v_user_id);
END;
$$;
