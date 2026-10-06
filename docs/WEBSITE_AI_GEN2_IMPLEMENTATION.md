# Website AI Assistant Gen 2 — Implementation Pass 1

Date: 2026-10-05

## What changed

- Replaced browser Web Speech recognition with MediaRecorder audio capture and server-side Groq Whisper Large V3 Turbo transcription.
- Added automatic language metadata from transcription and language-aware browser TTS selection.
- Added speech-activity detection and a barge-in monitor that cancels active speech when the user starts talking.
- Added server-side transcription through the existing dedicated `Homepage Voice Agent` Groq key; the secret never reaches the browser.
- Added durable DB3 Website AI knowledge tables for sources, versioned documents, structured facts, learning-gap candidates, and AI configuration versions.
- Mirrored approved Web Assistant knowledge into the durable DB3 ledger while preserving the existing DB1 site configuration as the live site configuration source.
- Added a protected daily Vercel Cron endpoint that refreshes configured website knowledge sources and synchronizes the durable ledger.
- Added learning-gap capture when a public visitor receives an explicit uncertainty response; basic contact/secret-like values are redacted before storage.

## Architecture after this pass

Voice:

`microphone -> VAD/MediaRecorder -> Groq Whisper multilingual STT -> shared assistant brain -> language-aware TTS -> speaker`

Knowledge:

`website/admin source -> change detection -> approved site knowledge -> DB3 durable ledger -> assistant retrieval`

Learning:

`unknown public question -> uncertainty response -> redacted learning candidate -> human validation`

## Important limitation

Groq Whisper provides multilingual speech-to-text. Groq's currently documented Orpheus TTS models cover English and Saudi Arabic, not Bangla/Hindi/Spanish. This pass therefore makes the browser TTS language-aware and preserves a provider boundary for the next dedicated multilingual TTS phase; it does not claim that every browser has a natural voice for every language.

## Database

The additive DB3 migration was applied live to the connected `antheticplus-ai-prod` project as:

`website_ai_foundation_2026_10_05`

The migration file is included in this ZIP so the schema change is reproducible from source control.

## Verification

- Changed TypeScript files: syntax/transpile check passed.
- `vercel.json`: JSON parse passed.
- Full `tsc --noEmit`: blocked in this ZIP because dependencies are not installed in the offline environment (`vite/client` and `vitest/globals` type definitions unavailable).
