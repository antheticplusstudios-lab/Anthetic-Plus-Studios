# Website AI Gen-2 Complete Release

## Architecture

The Website AI Assistant is one independent assistant system. The four Automation AIs remain separate systems with separate prompts, tools, permissions, state and evaluation. Shared infrastructure is allowed, but the Website AI does not inherit Automation AI tools.

## Completed layers

1. Multilingual streaming-style capture pipeline with Groq Whisper Large V3 Turbo transcription and language metadata.
2. Language-aware browser voice output with immediate cancellation and barge-in monitoring.
3. Authoritative website knowledge sync into DB3 with source/document/fact versioning.
4. Public knowledge-gap capture with redaction; user statements never become authoritative facts automatically.
5. Site isolation and server-side authorization for assistant tools.
6. Explicit confirmation tokens for side-effecting assistant actions.
7. Daily knowledge refresh cron.
8. Effective AI configuration version ledger and evaluation runner.
9. Evaluation coverage for pricing discovery, policy discovery, multilingual input and private-data boundaries.
10. Existing canonical LLM router remains the model gateway; current target model is `openai/gpt-oss-120b` through the dedicated Groq route.

## Important production boundary

Groq's current TTS availability does not provide the full multilingual natural-voice coverage required for Bangla/Hindi/Spanish. This release therefore keeps a browser TTS fallback rather than pretending that Groq provides a multilingual premium TTS model. A premium multilingual TTS provider can be added behind the server-side voice provider boundary without changing the assistant brain or tools.

## Deployment

The source repository is GitHub-linked to both Vercel projects. This workspace can prepare and validate the release artifact, but the connected GitHub integration is read-only and the connected Vercel tool does not expose a source-upload deployment operation. Production deployment therefore requires either pushing this release to `main` through an authorized Git client or providing an authorized deployment path.
