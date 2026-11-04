-- One-time cleanup for DB3 after standardizing all generated speech on Inworld.
-- Review and run manually in the DB3 SQL editor; this is not a Supabase app migration.
begin;

drop index if exists public.idx_llm_requests_tts_surface_created;
drop index if exists public.idx_llm_requests_tts_site_created;
drop index if exists public.idx_llm_requests_tts_client_created;

-- These rows are obsolete: the application no longer supports this provider.
delete from public.llm_api_keys where provider_key = 'elevenlabs';
delete from public.llm_providers where provider_key = 'elevenlabs';

commit;
