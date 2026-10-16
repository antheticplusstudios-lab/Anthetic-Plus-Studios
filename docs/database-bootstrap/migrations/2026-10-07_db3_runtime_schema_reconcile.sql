-- DB3 additive compatibility reconciliation for the current runtime.
BEGIN;
ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS encrypted_api_key text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.kb_documents ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
COMMIT;
