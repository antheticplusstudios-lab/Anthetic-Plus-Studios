-- ===== DB1 app_auth: sign-up domain, ban/mute, contact messages, email campaigns =====
alter table public.profiles add column if not exists signup_domain text;
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists muted_until timestamptz;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'antheticplus',
  name text not null, email text not null, company text, topic text not null,
  message text not null, delivered boolean not null default false,
  created_at timestamptz not null default now()
);
grant all on public.contact_messages to service_role;
revoke all on public.contact_messages from anon, authenticated;
alter table public.contact_messages enable row level security;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('antheticplus','autumic','both')),
  subject text not null, body_markdown text not null,
  recipients int not null default 0, sent int not null default 0,
  created_by uuid, created_at timestamptz not null default now()
);
grant all on public.email_campaigns to service_role;
revoke all on public.email_campaigns from anon, authenticated;
alter table public.email_campaigns enable row level security;
