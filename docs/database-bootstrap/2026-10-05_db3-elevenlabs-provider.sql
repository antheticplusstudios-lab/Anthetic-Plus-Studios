-- Data bootstrap for DB3's multilingual Website AI TTS provider.
-- This is intentionally a reference SQL file; the live provider row was already applied directly.
insert into public.llm_providers
  (provider_key, display_name, base_url, status, priority, default_model, metadata)
values
  ('elevenlabs', 'ElevenLabs', 'https://api.elevenlabs.io', 'active', 50, 'eleven_v4',
   '{"kind":"tts","multilingual":true}')
on conflict (provider_key) do update
set display_name = excluded.display_name,
    base_url = excluded.base_url,
    status = 'active',
    priority = excluded.priority,
    default_model = excluded.default_model,
    metadata = excluded.metadata,
    updated_at = now();
