-- One-time DB2 cleanup after the automation catalog was aligned with the actual runtime.
-- Review and run manually in DB2. This only removes rows from the legacy generic key pool;
-- active Twilio integration_connections, central DB3 LLM keys, and website_assistant Inworld keys are untouched.

begin;

delete from public.automation_key_pools
where provider in ('llm', 'twilio', 'resend')
   or (provider = 'inworld' and scope = 'ai_receptionist');

commit;
