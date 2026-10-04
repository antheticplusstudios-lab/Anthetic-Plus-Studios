-- Extends llm_api_keys to allow "openai" and "anthropic" as providers,
-- alongside the existing "openrouter" and "groq". This supports
-- src/lib/ai-completion.server.ts (used by knowledge-draft generation,
-- conversation diagnostics, and transcript evaluation), which replaced
-- those three features' direct calls to the Lovable AI Gateway.
--
-- Does NOT edit 0004_stage1_gen2_foundation.sql — that migration is
-- already applied and stays as historical record. "lovable" is dropped
-- from the allowed set here because nothing in the application ever
-- writes it as a provider value anymore.
ALTER TABLE public.llm_api_keys DROP CONSTRAINT IF EXISTS llm_api_keys_provider_check;
ALTER TABLE public.llm_api_keys
  ADD CONSTRAINT llm_api_keys_provider_check CHECK (provider IN ('openrouter', 'groq', 'openai', 'anthropic'));
