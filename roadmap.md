# Roadmap (AntheticPlus v1.2 Gen 2)

- [x] Stage 1: Gen 2 widget foundation — `client_automations`, installation token hashing, `/widget.js` Metal Balls runtime, conversations/messages, usage metering, LLM request ledger, server-side pricing, audit path
- [x] Stage 2 core: Users/Clients, moderation controls, All/Running Automations, Automation Control Center, health/diagnostics, script generation, per-automation widget manager
- [x] Stage 2 complete: global admin search across users/clients/automations/orders/conversations
- [x] Stage 3 foundation: Workflow Automation durable definitions/steps/runs/schedules/webhooks and worker execution
- [ ] Stage 3 remaining: full production channel implementations for Receptionist, Messaging AI and Sales Agent handoff
- [x] Stage 4 foundation: knowledge documents, chunking, embeddings, vector retrieval / RAG context injection
- [ ] Stage 4 remaining: crawl ingestion hardening, indexing/observability and evaluation suite
- [ ] Stage 5: Twilio / Meta / Telegram / calendar / email production integrations
- [x] Stage 6 core: Round-Robin teams/members/rules/assignments plus billing/lifecycle foundations
- [x] Stage 6 remaining: owner emergency controls and operational kill-switch UX
- [ ] Stage 7: Gen 1 database/table retirement and final generated-type cleanup after production cutover verification

## Voice Agent + AI Assistant rebuild (2026-10)
- [x] Unified assistant brain, tool registry, signed confirmations, audit
- [x] Homepage voice + text console, /assistant page
- [ ] Live end-to-end tests (sign-in, tools, email, permissions) — blocked on project secrets
- [ ] Optional: route the admin Control Center assistant through the unified brain (needs approval)

## Continuation build (2026-10-03)
- [x] Restore uploaded baseline source into project
- [x] Phase 1: AI Assistants menu entry + full per-site admin editor (Overview, Persona, Business, Services, Knowledge, Sources, Discovery, Tools, Voice, Analytics, Test Chat) on existing audited server RPCs
- [ ] Phase 1: live preview test of admin editing — blocked on DB1–DB4 + auth secrets being added to this project
- [ ] Phase 2: four automations execution engine (lifecycle, retries, idempotency, round-robin locking) — needs non-destructive migration, awaiting approval
- [ ] Phase 3: Admin Control Center regrouping (AI Assistants / Automations / AI Infrastructure / Operations)
- [ ] Phase 4: security audit, UX polish, full testing

## Phase 2 (in progress)
- [x] Homepage no longer crashes when database keys are missing (catalog price fallback, safe signed-out client)
- [x] DB2 migration file: lead_capture + kb_support types (2026-10-03_db2_automation_types.sql)
- [x] DB4 migration file: executions/events/attempts, claim/finish/enqueue, fixed round-robin + reassign
- [x] Facade: outbox_events/processed_events require explicit owning DB; new DB4 tables/RPCs mapped
- [x] DB4 migration applied + verified live (9/9 checks passed, rolled back test data)
- [ ] DB2 types — BLOCKED: live DB2 uses enum automation_product_type on product_type (no CHECK; orders has no automation_type column). Needs user approval for ALTER TYPE ... ADD VALUE
- [ ] Live DB2 orders schema differs from app code (code writes orders.automation_type which does not exist) — needs reconciliation
- [ ] Execution worker + admin automation UI on top of the new tables
