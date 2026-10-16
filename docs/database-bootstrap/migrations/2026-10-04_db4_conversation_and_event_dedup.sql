-- DATABASE: DB4 (antheticplus-crm-prod, ref iztbylxqvvrhsyislqlk) — APPLIED LIVE 2026-10-04 after application route hardening.
-- Additive only: two indexes. No rows are modified or deleted.
--
-- 1) Widget chat creates a conversation on a visitor's first message with a SELECT-then-INSERT. Two concurrent
--    first messages create two conversations for one session. A partial unique index closes that race.
-- 2) automation_events de-dup is (provider, external_event_id), global across tenants. Two tenants whose
--    provider (e.g. Twilio) emits the same event id would have the second tenant's event silently dropped as a
--    duplicate. Scope the key to the automation.
--
-- PRE-CHECK (must return 0 rows, otherwise the unique index creation fails; resolve duplicates by hand first):
--   SELECT automation_id, visitor_session, count(*) FROM public.conversations
--   WHERE visitor_session IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
--
-- NOTE: step 2b is NOT safe with the current code. src/routes/api/public/automations/webhook.ts looks up a prior
--       event by (provider, external_event_id) and treats a row for a different automation as "duplicate". After 2b
--       that lookup could match several rows. A route change (scope the lookup and the 23505 handling to
--       automation_id) must ship first. Steps 1 and 2a are independent and safe now.

-- 1)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_automation_visitor_uniq
  ON public.conversations (automation_id, visitor_session)
  WHERE visitor_session IS NOT NULL;

-- 2a) new, scoped uniqueness. The webhook route scopes duplicate lookup by automation_id.
CREATE UNIQUE INDEX IF NOT EXISTS automation_events_dedup_per_automation_uniq
  ON public.automation_events (automation_id, provider, external_event_id);

-- 2b) Safe after the route change: remove the old global uniqueness constraint.
ALTER TABLE public.automation_events DROP CONSTRAINT IF EXISTS automation_events_dedup_uniq;

-- ROLLBACK
-- DROP INDEX CONCURRENTLY IF EXISTS public.conversations_automation_visitor_uniq;
-- DROP INDEX CONCURRENTLY IF EXISTS public.automation_events_dedup_per_automation_uniq;
-- (if 2b was run) ALTER TABLE public.automation_events ADD CONSTRAINT automation_events_dedup_uniq UNIQUE (provider, external_event_id);
