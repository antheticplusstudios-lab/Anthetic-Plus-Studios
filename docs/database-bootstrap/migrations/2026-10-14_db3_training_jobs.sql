-- ===== DB3 app_ai: auto-training jobs =====
create table if not exists public.training_jobs (
  id uuid primary key default gen_random_uuid(),
  target text not null,          -- 'site:antheticplus' | 'site:autumic' | 'automation:<uuid>'
  source_url text,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  pages int not null default 0, chunks int not null default 0, error text,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now()
);
grant all on public.training_jobs to service_role;
revoke all on public.training_jobs from anon, authenticated;
alter table public.training_jobs enable row level security;
