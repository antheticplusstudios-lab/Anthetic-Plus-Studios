# Gen 2 Continuation — 2026-09-29

## Recovered / completed in this pass

- Restored one canonical `WidgetConfig` contract for the admin Control Center and client Widget Customizer.
- Normalized older widget-editor shapes into the DB2 Metal Balls shape during server-side saves.
- Updated the Control Center preview and controls to use canonical Metal Balls units/fields.
- Removed active `system_settings` reads from the admin settings path and removed the legacy table from the DB facade routing catalog.
- Hardened admin script generation with automation-scope authorization and audit logging.
- Changed generated installation snippets to load `/widget.js` and carry the token as a `data-token` attribute rather than putting it in the script URL query string.
- Removed the production widget's same-origin API fallback: the runtime now requires the configured FastAPI gateway and calls `/v1/widget/*`.
- FastAPI widget config now canonicalizes legacy DB2 widget records before returning configuration.
- FastAPI widget chat now records assistant message IDs, emits message outbox events, updates last-seen runtime data, and idempotently meters token usage in DB2.
- FastAPI widget endpoints honor the DB1 `public_widget` feature flag as an operational kill switch.
- Added owner-only global admin search with scope-aware client/automation/order/conversation navigation.
- Added owner-only Emergency Controls for global automation pause/resume, public widget shutdown, storefront shutdown and maintenance mode.

## Verification performed

- Python backend: `python -m compileall -q backend` passed.
- TypeScript source parsing: every `.ts` / `.tsx` file passed `typescript.transpileModule` syntax diagnostics.
- Full `tsc --noEmit` remains dependency-blocked because `node_modules` is absent in this checkout (first missing definition: `vite/client`).
- TypeScript dependency install/build was not completed in this environment because project dependencies were not locally available; static source inspection was used instead.

## Next production work

Complete channel integrations, RAG crawl/evaluation hardening, and final Gen 1 retirement remain tracked in `roadmap.md`.
