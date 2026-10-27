# Anthetic Plus Studios upgrade
## Oct 24 request
- [ ] Floating (detached, rounded) top bar instead of full-width stuck bar.
- [ ] Material 3 easing + reduced-motion on dialogs, navigation, buttons.
- [ ] Solutions section: only real products, admin-editable (add/edit/delete, per-solution product redirect) via platform_settings + fallback.
- [ ] Tasteful 2D animations across the site.
- [ ] Dashboard/admin mobile+desktop overflow audit; fix clipped headings/glass panels.
- [ ] Verify: typecheck, tests, build, browser checks; report DB-credential gaps honestly.
## Oct 22 request (Material 3 + Three.js)
- [x] Merge Solutions page into Products (/automations); /solutions 301-redirects; removed from header/footer.
- [x] Three.js ambient hero layer (hero-3d.tsx, React Three Fiber) on all public pages; client-only, reduced-motion safe, pauses in hidden tabs.
- [x] Material 3 emphasized easing in shared tokens (scroll reveals, lift, state layers propagate to admin/dashboards).
- [x] Verify: 205 tests pass, typecheck clean, build OK; browser-checked 8 public pages incl. redirect, canvases, zero hydration errors; scroll reveals + mobile (390) overflow clean.
- [ ] Admin/dashboard screens verified only via shared tokens — not individually re-screenshotted (signed-in data blocked by missing DB credentials).
## Luxe Glass 2.0 full-product redesign
- [x] Audit every registered route, shared UI, auth, assistant/voice, integrations and deployment.
- [x] Establish pearl/midnight glass tokens, fallbacks, accessible typography and reusable controls.
- [x] Update global navigation, public layouts, homepage orb/chat composition and public content surfaces.
- [x] Apply shared workspace, modal, form and loading/error surface roles; replace customer mobile navigation with a focus-managed sheet.
- [x] Check available route states, language picker, dialog/menu controls, five homepage widths and automated tests.
- [x] Record route inventory and verification results in docs/LUXE-GLASS-VERIFICATION.md.
- [ ] Finish route-by-route signed-in workspace visual and interaction checks — blocked by unavailable external account/database configuration.
- [ ] Verify live English/Bangla microphone and speech conversations — blocked by unavailable assistant/provider configuration.
- [x] Repository formatted with Prettier; ESLint on src has 0 errors (23 pre-existing Fast Refresh warnings in shadcn components, not from Luxe Glass).
- [x] Mobile (390) and tablet (820) overflow + render check on /, /security, /docs, /solutions, /about, /contact — all clean; scroll-reveal horizontal overflow fixed with html/body overflow-x: clip.
- [x] Homepage midnight Journey + CTA sections converted to light pearl; full-width glassy sticky header (no white gap above it); query cache raised to 5 min with 60s route preload.
- [ ] Review remaining public/admin pages at narrow widths and verify blur/WebGL failure fallbacks; six public routes checked so far.
## Current motion request
- [x] Smooth continuous orb/ring motion; real assistant states retain phase and smoothly change speed (3 regression tests).
- [x] Framer Motion page and hero entrances; preserve visible, themed Block Drift background.
- [x] Verify navigation, refresh, idle motion continuity, reduced-motion pause, and small-screen rendering; 20 targeted tests passed, preview build OK, no browser errors.
- [ ] Live speaking/listening end-to-end verification — blocked: assistant reports offline; provider/database configuration unavailable in this workspace.
- [x] Import the supplied existing application without replacing deployment configuration or production data.
- [x] Audit authorization, real data sources, partner website ingestion, widget, and installation.
- [x] Fix partner website URL behavior and add regression coverage.
- [ ] Upgrade shared admin navigation, overview, management, and controls.
- [x] Upgrade actual floating widget and shared installation preview.
- [ ] Validate available automated tests, lint, runtime, accessibility, and mobile layout.
- [ ] Document exact changes and external deployment/credential blockers.
## Oct 14 request
- [x] Hero Block Drift: full opacity, original colours (near/edge = page foreground, far = background).
- [ ] Partner website URL flow: persist assistant config + scan status per team (needs DB write path confirmation).
- [ ] AI Receptionist: 10 services (call handling, scheduling, bookings, sales qualification, follow-up, support, CRM capture, payments, outbound reminders, recommendations) as toggleable, zero-setup modules.
- [ ] Per-automation provider key pools (separate round robin per automation, instant failover without losing conversation).
- [ ] Automations admin: one clear management page per each of the 4 automations.
- [ ] Auto-training pipelines: website crawl → assistant knowledge (own + partner sites); client data → per-automation context, AI fallback.
- [ ] Contact page + form via Resend (key added later) to the existing site inbox.
- [ ] User management: view, ban, mute, automations, domains, connected platforms; origin-domain badges on users and automations.
- [ ] Clearer admin and client dashboard UX.
## Oct 14 progress
- [x] Project imported; 4 external databases kept.
- [x] Per-automation key rotation engine with instant failover that keeps the conversation (src/lib/key-pool.ts) + tests.
- [x] 4-automation catalog with the 10 AI Receptionist services, Inworld limits of 10 for the receptionist and 5 for the website assistant + tests.
- [x] Safe Markdown email renderer (images and links) + tests.
- [x] Migration SQL for key pools, service toggles, origin domains, ban/mute, contact inbox, campaigns, training jobs.
- [x] Automations management pages (services + keys done; integrations, test, activity next).
- [ ] Swap ElevenLabs for Inworld voice using the key pool.
- [x] Twilio option on the order form, plus a support request to turn it on later.
- [ ] Contact inbox in admin, platform-split Resend keys, admin bulk email sender.
- [ ] Users page (ban, mute, domains, badges) and simpler dashboards.
- [ ] Auto-training workers for both sites and each client's automations.
- [x] 4 database keys saved and connections verified.
- [ ] Run the 3 new 2026-10-14 setup files in DB1, DB2, DB3 SQL editors (blocked on user).
- Blocked on user: Resend keys + inbox, Inworld keys, Twilio connection.
- [x] Admin "Automation API keys" page (/admin/integration-keys): per-automation pools for Inworld (10 receptionist / 5 website assistant), Twilio, Resend, AI keys — add encrypted, toggle, test, delete; shows a connect-databases panel until DB2 keys exist.
- [x] DB2 type rows added for automation_key_pools and automation_service_toggles; DB1 contact_messages/email_campaigns; DB3 training_jobs; new columns typed.
## Oct 15 request
- [ ] Contact page works (nav no longer opens Gmail)
- [x] Auto-training jobs with status + Train now in admin (/admin/training)
- [x] Integrations / Test / Activity / Training tabs per automation
- [ ] Inworld replaces ElevenLabs in receptionist voice
- [ ] Admin + website polish
## Oct 19 redesign (light premium SaaS)
- [x] Light design system tokens, Plus Jakarta Sans, button variants; no gradient text.
- [x] New header (real routes only) and footer; removed unverified uptime / testimonial claims.
- [x] Homepage: hero + live AI Orb + compact assistant chat on the real session/voice loop.
- [x] Public pages (automations, product detail, checkout, security, status, contact, auth) re-themed via shared tokens.
- [x] Admin + client dashboards re-themed via shared tokens (admin-workspace now light).
- [ ] Authenticated screens verified with real data — blocked: DB1–DB4 credentials not configured in this workspace.
- [x] Solutions, Docs, About pages added; linked in header and footer.
- [x] English/Bangla language picker (header) for site chrome, homepage and new pages.
- [x] Bangla for products, pricing, security, status, contact and sign-in pages.
- [x] Orb: orbiting rings, tap-to-talk, hearing and talking animations tied to the real voice loop.
