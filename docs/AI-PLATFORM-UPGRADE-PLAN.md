# AntheticPlus AI Platform Upgrade Plan

Status: architecture and safe first-pass code changes based on the Checkpoint 3 project ZIP reviewed on 2026-10-12.

## Non-negotiable constraints

- Preserve the four independent database projects and their ownership boundaries:
  - DB1: identity, organizations/tenancy, roles, audit, platform settings.
  - DB2: orders, payments, subscriptions, automation lifecycle, installation/configuration.
  - DB3: encrypted provider keys, model routing/telemetry, knowledge and evaluation data.
  - DB4: CRM, conversations, leads, round-robin assignments, workflow execution/history.
- Do not introduce cross-database foreign keys or move data ownership between databases.
- All writes stay server-side, authenticated, tenant-scoped, validated, and audited.
- No provider keys, installation secrets, service-role keys, or HMAC secrets in browser code or generated public snippets.
- Treat the supplied Checkpoint 3 ZIP as the baseline. Preserve the hero animation fix in `src/components/block-drift.tsx`.
- Do not run SQL migrations against production until each target DB has a backup, migration diff review, and per-database verification.

## Product boundaries

### 1. Private Admin AI

A staff-only copilot for authorized administrative questions about users, organizations, orders, payments, subscriptions, automation health, usage, costs, key-pool health and audit events. Every answer about changing data must use authorized server-side tools. Client/partner roles must never inherit owner-only capabilities. Sensitive mutations should return a preview and require explicit confirmation.

### 2. Website AI Agent (one agent, text + voice)

The website AI Assistant and its voice mode are one assistant brain, not separate products. They share conversation policy, approved knowledge, tools, evaluation, feedback and learning pipeline. Voice is a channel with its own TTS/STT settings and channel health, not a second independent agent.

The current code already routes text and voice through the shared assistant service, but the admin navigation and legacy voice settings make the product boundary confusing. The Website AI Agent settings should be the canonical place for persona, approved knowledge, allowed tools, text/voice availability, language, voice, test console and learning health. Any retained voice infrastructure page should be explicitly labeled infrastructure (provider/TTS/email diagnostics), not a separate agent.

### 3. Four independent automations

1. **AI Receptionist** — call handling and the ten service areas listed below.
2. **Meta Messaging AI** — social DMs, channel-specific policies, opt-in handling, message-window/provider compliance, escalation, retries and delivery analytics.
3. **Lead Capture & Qualification** — forms/conversations, qualification, scoring, deduplication, assignment, follow-up and CRM sync.
4. **Knowledge Base & Support** — approved-source retrieval, citations, confidence thresholds, handoff, unresolved-question queue and content freshness.

Each automation has its own client configuration, enabled/paused state, tool permissions, provider policy, execution history, usage and tests. Shared libraries are encouraged; a failure in one automation must not disable the other three.

## AI Receptionist: required service catalog

The uploaded `AI Receptionist — Core Services.pdf` specifies:

1. Call handling: 24/7 inbound calls, FAQs, products/services, prices and hours, multiple callers, transfer, messages and caller details.
2. Appointment and scheduling: book, reschedule, cancel, check availability, consultations/sales calls/demos, confirmations and reminders.
3. Booking and reservations: hotels, restaurants, events, tours/activities and appointments; availability, changes, cancellations and confirmations.
4. Sales and lead qualification: requirements, budget, location, urgency, recommendations, contact capture, sales-call booking and high-value handoff.
5. Lead follow-up and recovery: missed calls, unanswered inquiries, leads that did not book, post-consultation follow-up, abandoned bookings and re-engagement.
6. Customer support: FAQs, policies, instructions, basic complaints and escalation with context.
7. Data collection and CRM: name, phone, email, requirements, budget, location, appointment details, lead status and conversation summary.
8. Payment assistance: payment links, payment options, deposits, payment-status lookup and invoices/receipts through connected systems.
9. Outbound calls and reminders: appointments, bookings, lead follow-up, consultations, satisfaction, payments, events and re-engagement.
10. Personalized recommendations: relevant services, packages, slots, properties, hotel rooms and options based on needs.

### Receptionist order of operations

1. Resolve caller/channel, tenant, business and current automation state.
2. Identify intent and urgency; handle emergency/safety cases with configured human escalation.
3. Verify identity only when a protected record or account-specific action requires it.
4. Gather the minimum required fields and confirm critical spelling, date, timezone, amount and contact method.
5. Read authoritative availability/pricing/policy from connected tools; never invent it.
6. Present the proposed action and exact details.
7. Require confirmation before booking, cancellation, payment initiation, outbound messaging or other consequential side effects.
8. Execute through an idempotent server tool; protect against duplicate webhook/call retries.
9. Confirm only after the connected provider returns success; otherwise explain failure and offer a safe next step.
10. Persist a structured interaction summary, consent/opt-in, outcome, lead status and execution trace; schedule follow-up only when permitted.
11. Escalate with context when confidence is low, the integration fails, a caller requests a human, or a policy boundary is reached.
12. Run post-call checks and record provider latency, failures, tool results, cost and quality signals.

Bookings, calendars, telephony, SMS, CRM and payments are separate integrations. A single client connection can group them in one setup wizard, but each provider credential and permission must be verified individually. One key cannot magically authorize unrelated third-party services.

## One connection for any client website

Build a tenant-scoped **Connection Hub** that issues a revocable, rotatable, scoped public installation token and gives clients a copy/paste integration snippet or framework instructions. The client can choose:
- Widget experience, or
- Headless integration where the client controls the UI and calls the secure AntheticPlus API.

The public token identifies the installation and allowed origin; it is not an API provider secret and must not authorize admin access. Keep secret signing material server-side. Verify origin, token scope, automation ID, tenant status, rate limits and tool permissions on every request. Provide test mode, health status, rotation/revocation, last-used timestamp, integration logs and copy-ready instructions for common frameworks. For headless use, publish a versioned REST API and typed SDK/examples rather than asking a client's AI to invent an unsafe arbitrary script.

For the AI Receptionist, the same tenant connection can link web chat and phone/SMS channels to the same automation configuration and customer record. Telephony numbers, calendar OAuth, SMS sender IDs and payment-provider accounts still require their own setup/verification where the provider requires it.

## Natural-language tool builder: algorithm first, AI as an assistant

This can be built as a constrained declarative system; it does not need an AI model to execute every change. AI can translate a request into a proposed tool/workflow specification, but deterministic validation and permission checks must decide whether it can be installed.

Recommended lifecycle:
1. Client describes the desired capability in a prompt box.
2. AI drafts a versioned tool specification (name, purpose, JSON input schema, connector, read/write scope, confirmation requirement, timeout, retry/idempotency rules and expected output).
3. A deterministic validator checks allowed connector types, schema size/types, permissions, tenant ownership, data classification, rate limits and side-effect policy.
4. Generate a workflow from an allowlisted set of connector operations. Never execute arbitrary AI-generated code, shell commands, SQL, or unrestricted URLs.
5. Show a diff and test fixture in a sandbox. Read-only tools can be tested against safe sample data; write tools use provider sandbox mode where available.
6. Require explicit client approval for permissions and a second confirmation for high-impact actions. High-risk connectors may also require platform review.
7. Publish a new immutable version, run smoke tests, then atomically switch the automation to it.
8. Keep rollback to the last known-good version, audit who approved it, and expose health/error status.
9. If a request needs an unsupported connector or capability, say so and guide the client through the required authorization rather than pretending it was installed.

AI-generated specs are untrusted input. The executor must independently validate every argument and permission at runtime. This is consistent with current function-calling guidance: tool definitions provide structure, but the application—not the model—executes and authorizes each tool call.

## Provider pool and fair key rotation

“Unlimited API key usage” cannot be guaranteed: providers impose quotas, rate limits, account policies and billing limits. The platform can support a large pool of legitimately owned/authorized keys and improve availability by rotating fairly.

Required behavior:
- Separate **AI provider-key routing** from **CRM lead-assignment Round-Robin** in the admin UI and terminology.
- Use one canonical DB3 provider pool with tenant/product policy labels; do not copy plaintext keys into each automation or expose them to clients.
- Define pool scope explicitly: platform-owned keys, client-owned keys, provider, model, eligible automation(s), enabled state and priority/weight.
- Select eligible keys with fair/weighted round-robin or least-recently-used scheduling, then respect provider/model capability and per-key/client/provider quotas.
- On 429, timeout or provider outage, apply bounded exponential backoff/cooldown and try another eligible key; do not endlessly retry or bypass a provider's account limits.
- Track per-key requests, tokens, estimated cost, latency, errors, cooldown and last-used time. Alert on near-quota and exhausted pools.
- Add per-automation budget/rate caps and a circuit breaker. If no eligible key remains, return a clear temporary-unavailable response and record it.
- Never route a request to a key the tenant or automation is not authorized to use.

## Admin panel information architecture

Group navigation into:
- Overview
- AI & Website Agent
- Automations & Workflows
- AI Infrastructure
- Clients & Operations
- Finance & Subscriptions
- Platform & Security

Use consistent names and page templates. Show role-appropriate pages only. Keep the private Admin AI distinct from the public Website AI Agent. Keep provider key pools distinct from lead assignment rules. Add a unified search, breadcrumbs, recent items, and a per-page description of whether the page changes live configuration or only observes it.

## Safe auto-training / continuous improvement

“Auto-train” should mean controlled knowledge refresh and evaluation, not unreviewed self-modification:
- Crawl only explicitly approved domains and documents, with size/robots/SSRF protections and a refresh schedule.
- Extract candidate knowledge with source URL, timestamps, content hash and evidence.
- Deduplicate, detect conflicts and mark low-confidence or sensitive content for review.
- Automatically publish only low-risk facts from an explicitly allowlisted trusted source under a configured policy; keep pricing, legal, financial, account, medical/safety and transactional policy changes review-gated.
- Record anonymized/redacted question gaps, thumbs-up/down and failed retrievals; minimize personal data.
- Run a fixed evaluation suite before promoting a prompt/knowledge version. Compare answer correctness, groundedness, tool success, latency and cost.
- Publish immutable versions with canary rollout and one-click rollback.
- Never train on secrets, private cross-tenant data, or raw conversations by default.

## Delivery phases and gates

### Phase 0 — Preserve and verify
- Keep the checkpoint and hero animation change.
- Capture current test/build results and DB migration status.
- Make no schema changes in this phase.

### Phase 1 — Recover and clarify UI
- Restore NY Partners as an isolated assistant entry in the admin assistant registry.
- Group admin navigation and clarify Website AI Agent vs Admin AI vs automation pages.
- Rename confusing provider pool and lead-assignment pages.
- Verify all existing admin routes and role gates.

### Phase 2 — Agent consistency
- Make text and voice use the same site agent configuration and evaluation.
- Add voice/provider health to the same agent page; keep infrastructure credentials in restricted settings.
- Add learning-candidate queue, source freshness and eval results.

### Phase 3 — Automation reliability
- Ship receptionist intent/order state machine, confirmation, idempotency, retry/dead-letter behavior and human handoff.
- Add integration setup/health for calendar, telephony, SMS, CRM, email and payments.
- Upgrade messaging, lead qualification and support with isolated test suites.

### Phase 4 — Connection Hub and tool builder
- Versioned headless API + copy-ready integration examples.
- Scoped token lifecycle and per-origin enforcement.
- Declarative workflow/tool builder, deterministic validation, sandbox, approval and rollback.

### Phase 5 — Provider fairness and observability
- Unified DB3 pool policies and per-automation budgets.
- Clear distinction between API provider rotation and CRM assignment round-robin.
- Dashboards for quotas, cost, latency, errors, retries and provider health.

### Required release gate for every phase
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Verify tenant isolation, authorization, idempotency, rate limits, audit logs and origin/token checks.
- Run the four DB verification scripts against the correct four projects.
- Test with provider sandbox/test credentials before production.
- No production DB migration without backup, reviewed diff and rollback plan.

## Changes made in the safe first pass

- Added a registered `NY Partners` website assistant context with knowledge-search-only default tools and no first-party account/admin actions.
- Updated the assistant overview copy to state that text and voice are one website agent.
- Grouped admin navigation into categories and renamed ambiguous items so provider pools and lead-assignment rules are easier to distinguish.
- No database schema or production data was changed by these source edits.

## Important limitation

This is not a claim that every planned capability is implemented or live. The uploaded ZIP does not contain production credentials, actual provider accounts, deployed database state, phone numbers, calendar authorizations, or the verified NY Partners domain. Those need to be connected and tested in the target environment before declaring the related features operational.
