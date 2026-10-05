# Website AI — Multilingual Voice / TTS Gen-4

## What changed

The Website AI Assistant now treats language as first-class turn metadata instead of letting the browser choose a speech locale.

```text
microphone
  -> MediaRecorder + VAD
  -> Groq Whisper (server-side)
  -> language metadata (bn/en/hi/es/... + confidence + mixed-language cues)
  -> shared Website AI brain (Groq GPT-OSS 120B)
  -> language-aware response instruction
  -> ElevenLabs multilingual TTS (server-side streaming)
  -> browser audio playback
```

The four Automation AIs remain separate. This change does not grant the Website AI their tools or state.

## Language behavior

- Bangla speech is preserved as Bangla (`bn-BD`).
- Banglish can be detected from Latin-script Bengali cue words; the assistant is instructed to answer naturally in Bengali script unless transliteration is explicitly requested.
- Hindi, Spanish, French, German and several common script-based languages have direct detection heuristics.
- Voice STT language returned by Whisper is treated as a high-confidence hint.
- Mixed-language turns retain English/code-switching cues rather than forcing the whole turn into English.
- The TTS provider receives the response text and multilingual voice; it is not limited to the browser's installed voice list.

ElevenLabs v4 currently documents support for 90+ languages, including Bengali, Hindi, Spanish, Japanese, Korean and many others.

## Server-side TTS

`src/lib/voice-tts.server.ts` is the provider router. ElevenLabs is currently the primary provider.

- API key: encrypted in DB3 under `Homepage Voice Agent TTS` or supplied through the server-only `ELEVENLABS_API_KEY` fallback.
- Voice ID: `VoiceAgentSettings.ttsVoiceId` or `ELEVENLABS_VOICE_ID`.
- Model default: `eleven_v4`.
- Output: `mp3_44100_128` streaming audio.
- Browser receives audio bytes only; provider credentials never enter the client bundle.

The main assistant uses MediaSource streaming when the browser supports `audio/mpeg`; otherwise it buffers the response and plays it through an `HTMLAudioElement`.

## Barge-in

When the user starts talking while TTS is playing:

1. the voice loop's VAD fires `onSpeechStart`;
2. the active TTS request is aborted;
3. the current audio element is stopped and released;
4. the microphone begins a new turn;
5. the new STT result is sent to the same Website AI brain.

## Widget parity

`/assistant.js` now uses the same public `/transcribe`, `/chat` and `/tts` endpoints as the main voice path. Cross-origin widget requests include `?site=` on preflighted POST URLs so the server can validate the origin before the body is sent.

## Admin controls

Admin → AI Voice Agent now includes:

- TTS provider: ElevenLabs
- TTS model
- multilingual voice ID
- encrypted TTS API key storage/clear
- multilingual TTS test box
- configured-key status

## DB3 bootstrap

The live DB3 project has an active provider row for ElevenLabs:

```sql
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
```

## Required production configuration

Either configure the key and voice from the admin page (preferred for encrypted DB3 storage), or set these server-only variables:

```env
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_v4
```

The chosen ElevenLabs voice must be compatible with the multilingual model. The model and voice selection should be tested with the actual AntheticPlus conversational tone before production use.

## Validation performed in this workspace

- TypeScript/TSX transpile parsing: all 79 source files in the relevant source trees parsed without syntax errors.
- Generated `/assistant.js` widget JavaScript: parsed successfully as executable JavaScript.
- Language smoke tests: Bangla, Banglish, Hindi, Spanish, German, Japanese, Chinese and Korean produced expected language-family metadata.
- Full `tsc --noEmit` remains blocked by the repo's missing `vite/client` and `vitest/globals` type packages in this offline workspace; no code-level type diagnostics were obtained beyond those missing dependencies.
- Production deployment was not performed because the connected GitHub integration is read-only in this session.
