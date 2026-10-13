<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Admin sidebar categories come from an explicit `group` on each `adminNav` item, not path matching — paths like `/admin/automations/round-robin` belong to a different category than their prefix.
- Approved client capabilities are stored per automation in DB1 platform_settings (tool_activation:<id>) and enforced in the automation engine; a missing record means legacy behaviour. Why: activation must be auditable and reversible without schema changes.
- AI calls for product features go through the platform's own provider key pool (llm-router, DB3 keys), not a hosted AI gateway. Why: owner supplies and rotates their own keys.
- Website installation keys live in DB1 platform_settings (website_agent_keys:<siteId>) as SHA-256 hashes only; the widget sends website keys via X-Site-Key, servers use Bearer ap_sk_. Why: no schema change, raw secrets never stored.
- Website agent edits save to a draft (web_assistant_draft:<site>); only publish/rollback write the live row (web_assistant_site:<site>); snapshots in web_assistant_versions:<site>; partner-site domains must be verified (web_assistant_domains:<site>). Knowledge is never part of snapshots. Why: visitors only see reviewed, published settings, no schema change.
