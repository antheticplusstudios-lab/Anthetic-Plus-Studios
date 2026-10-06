-- Server-side Website AI multilingual TTS rate-limit query indexes.
-- Applied to live DB3 as website_ai_tts_rate_limit_indexes_2026_10_05.
create index if not exists idx_llm_requests_tts_surface_created
on public.llm_requests (created_at desc)
where provider_key = 'elevenlabs' and request_metadata->>'surface' = 'website_tts';

create index if not exists idx_llm_requests_tts_site_created
on public.llm_requests ((request_metadata->>'site_id'), created_at desc)
where provider_key = 'elevenlabs' and request_metadata->>'surface' = 'website_tts';

create index if not exists idx_llm_requests_tts_client_created
on public.llm_requests ((request_metadata->>'client_hash'), created_at desc)
where provider_key = 'elevenlabs' and request_metadata->>'surface' = 'website_tts';
