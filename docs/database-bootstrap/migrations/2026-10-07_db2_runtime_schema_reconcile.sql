-- DB2 compatibility reconciliation for the current AntheticPlus runtime.
-- ADDITIVE ONLY: preserves existing data and supports both the original bootstrap
-- vocabulary and the richer runtime schema used by the application.
-- Runtime states
 used by provisioning/testing gates.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_verification';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'verified';
ALTER TYPE public.payment_verification_status ADD VALUE IF NOT EXISTS 'verified';
ALTER TYPE public.automation_run_state ADD VALUE IF NOT EXISTS 'provisioning';
ALTER TYPE public.automation_run_state ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE public.installation_status ADD VALUE IF NOT EXISTS 'provisioning';

BEGIN;

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS yearly_discount_pct numeric(5,2) NOT NULL DEFAULT 20;

-- Current order API vocabulary (kept alongside the original bootstrap columns).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.orders
SET order_number = COALESCE(order_number, order_id),
    product_type = COALESCE(product_type, automation_type),
    product_name = COALESCE(product_name, automation_type),
    submitted_at = COALESCE(submitted_at, created_at),
    user_id = COALESCE(user_id, created_by_user_id),
    metadata = CASE WHEN metadata = '{}'::jsonb AND pricing_snapshot <> '{}'::jsonb THEN
      jsonb_build_object('pricing_snapshot', pricing_snapshot,
                         'target_domain_url', target_domain_url,
                         'company_name', company_name,
                         'full_name', full_name,
                         'contact_email', contact_email,
                         'country', country)
      ELSE metadata END;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uidx
  ON public.orders(order_number) WHERE order_number IS NOT NULL;

-- Payment verification compatibility columns used by the runtime.
ALTER TABLE public.payment_verifications
  ADD COLUMN IF NOT EXISTS trx_id text,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.payment_verifications
SET trx_id = COALESCE(trx_id, transaction_id),
    notes = COALESCE(notes, rejection_reason, sender_name, ''),
    metadata = CASE WHEN metadata = '{}'::jsonb THEN proof_data ELSE metadata END,
    reviewed_by = COALESCE(reviewed_by, verified_by_user_id),
    reviewed_at = COALESCE(reviewed_at, verified_at);

CREATE UNIQUE INDEX IF NOT EXISTS payment_verifications_active_trx_uidx
  ON public.payment_verifications(lower(trim(trx_id)))
  WHERE trx_id IS NOT NULL AND status IN ('pending','approved','verified');

-- Subscription runtime vocabulary.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.subscriptions
SET plan_code = COALESCE(plan_code, plan_slug),
    current_period_start = COALESCE(current_period_start, started_at),
    current_period_end = COALESCE(current_period_end, expires_at),
    cancelled_at = COALESCE(cancelled_at, canceled_at),
    product_type = COALESCE(product_type, ''),
    billing_interval = COALESCE(billing_interval, 'monthly');

-- Rich automation control-room/runtime fields.
ALTER TABLE public.client_automations
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'testing',
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS usage_current_period numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_limit numeric,
  ADD COLUMN IF NOT EXISTS usage_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_version text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS client_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS automation_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS installation_status text NOT NULL DEFAULT 'provisioning',
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS usage_count numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.client_automations
SET product_type = COALESCE(product_type, automation_type),
    domain = COALESCE(NULLIF(domain, ''), domain_url),
    company_name = COALESCE(NULLIF(company_name, ''), name),
    client_name = COALESCE(NULLIF(client_name, ''), name),
    automation_name = COALESCE(NULLIF(automation_name, ''), name),
    product_name = COALESCE(NULLIF(product_name, ''), name),
    owner_user_id = COALESCE(owner_user_id, NULL),
    organization_id = COALESCE(organization_id, client_id),
    user_id = COALESCE(user_id, owner_user_id),
    config = COALESCE(config, '{}'::jsonb),
    metadata = COALESCE(metadata, '{}'::jsonb);

CREATE UNIQUE INDEX IF NOT EXISTS client_automations_slug_uidx
  ON public.client_automations(slug) WHERE slug IS NOT NULL;

-- Installation compatibility fields.
ALTER TABLE public.automation_installations
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS installation_status text,
  ADD COLUMN IF NOT EXISTS installation_token_hash text,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS install_version text,
  ADD COLUMN IF NOT EXISTS runtime_version text;

UPDATE public.automation_installations ai
SET client_id = COALESCE(ai.client_id, ca.client_id),
    installation_status = COALESCE(ai.installation_status, ai.status::text)
FROM public.client_automations ca
WHERE ca.id = ai.automation_id;

-- Payment-method compatibility fields used by the customer/admin UI.
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS method_type text,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_identifier text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.payment_methods
SET method_type = COALESCE(method_type, CASE WHEN is_card THEN 'card' ELSE 'manual' END),
    account_name = COALESCE(account_name, method_name),
    provider_name = COALESCE(provider_name, method_name),
    metadata = COALESCE(metadata, '{}'::jsonb);

COMMIT;
