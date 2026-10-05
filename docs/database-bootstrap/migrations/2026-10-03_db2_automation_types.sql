-- DB2 — ADD-ONLY. The real DB2 stores product types in enum automation_product_type (no CHECK constraints).
-- Adds lead_capture (Lead Capture & Qualifier) and kb_support (Knowledge Base Support).
-- Existing values ai_receptionist, messaging_ai, ai_sales_agent, workflow_automation are untouched. No rows read or rewritten.
-- Rollback: not possible for enum values in Postgres; values are inert unless used.
ALTER TYPE public.automation_product_type ADD VALUE IF NOT EXISTS 'lead_capture';
ALTER TYPE public.automation_product_type ADD VALUE IF NOT EXISTS 'kb_support';
