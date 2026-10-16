-- ===== DB2 app_billing: per-automation key pools, service toggles, origin domains =====
create table if not exists public.automation_key_pools (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('ai_receptionist','workflow_automation','ai_sales_agent','message_ai','website_assistant')),
  provider text not null check (provider in ('llm','inworld','resend','twilio')),
  label text not null,
  key_ciphertext text not null,
  enabled boolean not null default true,
  cooldown_until timestamptz not null default 'epoch',
  uses bigint not null default 0,
  failures bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists automation_key_pools_scope_idx on public.automation_key_pools(scope, provider);
grant all on public.automation_key_pools to service_role;
revoke all on public.automation_key_pools from anon, authenticated;
alter table public.automation_key_pools enable row level security;

create table if not exists public.automation_service_toggles (
  automation_id uuid not null,
  service_id text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (automation_id, service_id)
);
grant all on public.automation_service_toggles to service_role;
revoke all on public.automation_service_toggles from anon, authenticated;
alter table public.automation_service_toggles enable row level security;

alter table public.automations add column if not exists ordered_on_domain text;
alter table public.automations add column if not exists running_on_domain text;
alter table public.automations add column if not exists wants_phone boolean not null default false;
