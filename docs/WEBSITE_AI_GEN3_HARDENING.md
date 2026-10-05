# Website AI Gen-3 Hardening

This release builds on the Website AI Gen-2 foundation and focuses on correctness, multilingual behavior, and production safety.

## Improvements

### 1. Structured response enforcement
The assistant now validates the model's JSON decision against a Zod contract. Invalid JSON is not silently treated as a user-facing answer. A single low-temperature repair attempt is made; if that also fails, the request fails safely.

### 2. Language-aware behavior at the reasoning layer
The user's language is detected from the incoming message and added as a system-level instruction. Bangla, Banglish, Hindi, Spanish, and general language preservation are explicitly handled. This is separate from voice rendering, so typed and spoken conversations follow the same language policy.

### 3. Tool execution deadlines
Read-only assistant tools have a 15-second execution deadline. A slow or stuck tool can no longer leave the assistant request hanging indefinitely.

### 4. Stronger knowledge authority rules
The prompt now uses this authority order:

1. live transactional/account tools
2. approved admin configuration and structured facts
3. approved business knowledge
4. current website content
5. general model knowledge

Retrieved website text and tool results are treated as factual data, never as instructions. This reduces prompt-injection risk from crawled content.

### 5. Knowledge deletion correctness
When an approved source or knowledge item disappears from the current snapshot, its durable DB3 document is superseded. Structured pricing/policy/hours facts that disappear from the current snapshot are also superseded.

### 6. Knowledge document versioning
New snapshots receive an incremented source version instead of resetting every document to version 1. Older approved snapshots remain auditable as superseded records.

## Voice status

The voice stack remains:

- Groq Whisper Large V3 Turbo for multilingual transcription.
- Browser TTS as the current rendering fallback.
- Language-aware voice selection.
- Barge-in cancellation and re-listening.

A premium server-side multilingual TTS provider should be connected separately when its credentials are provisioned. The application must not expose provider secrets to the browser.

## Separation rule

The Website AI Assistant remains a distinct AI system. The four Automation AIs are not merged into its prompt, tools, permissions, memory, or workflow state. Shared infrastructure is allowed, but capabilities remain explicitly separated.

## Validation

The changed TypeScript files pass TypeScript transpile/syntax validation in this release. A full dependency-backed typecheck/build should be run in an environment with the repository dependencies installed before production deployment.
