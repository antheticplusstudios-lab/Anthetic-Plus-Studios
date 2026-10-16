-- Website AI Assistant Gen 2 foundation (DB3 / AI project)
-- Applied to live DB3 as website_ai_foundation_2026_10_05.

create table if not exists public.website_ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  source_type text not null check (source_type in ('website','manual','database','policy','announcement','api')),
  source_name text not null,
  canonical_url text,
  content_hash text,
  status text not null default 'active' check (status in ('active','stale','error','disabled')),
  last_scanned_at timestamptz,
  last_success_at timestamptz,
  last_change_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, source_name)
);

create table if not exists public.website_ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.website_ai_knowledge_sources(id) on delete cascade,
  site_id text not null,
  title text not null default '',
  content text not null default '',
  content_hash text not null,
  version integer not null default 1,
  status text not null default 'approved' check (status in ('draft','approved','superseded','rejected')),
  authority integer not null default 50 check (authority between 0 and 100),
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create table if not exists public.website_ai_knowledge_facts (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  document_id uuid references public.website_ai_knowledge_documents(id) on delete set null,
  fact_key text not null,
  fact_value jsonb not null,
  status text not null default 'approved' check (status in ('draft','approved','rejected','superseded')),
  authority integer not null default 80 check (authority between 0 and 100),
  valid_from timestamptz,
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, fact_key)
);

create table if not exists public.website_ai_learning_candidates (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  question text not null,
  candidate_answer text,
  evidence jsonb not null default '[]'::jsonb,
  occurrence_count integer not null default 1,
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.website_ai_versions (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  version integer not null,
  model text not null,
  prompt_version text not null,
  knowledge_version integer not null default 1,
  tool_version text not null default '1',
  voice_config jsonb not null default '{}'::jsonb,
  eval_score numeric(5,2),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  created_at timestamptz not null default now(),
  unique (site_id, version)
);

create index if not exists website_ai_knowledge_documents_site_status_idx on public.website_ai_knowledge_documents(site_id, status, authority desc);
create index if not exists website_ai_knowledge_facts_site_key_idx on public.website_ai_knowledge_facts(site_id, fact_key, status);
create index if not exists website_ai_learning_candidates_site_status_idx on public.website_ai_learning_candidates(site_id, status, last_seen_at desc);
create index if not exists website_ai_versions_site_status_idx on public.website_ai_versions(site_id, status, version desc);

alter table public.website_ai_knowledge_sources enable row level security;
alter table public.website_ai_knowledge_documents enable row level security;
alter table public.website_ai_knowledge_facts enable row level security;
alter table public.website_ai_learning_candidates enable row level security;
alter table public.website_ai_versions enable row level security;
