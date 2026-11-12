-- Daily Islamic Content Automation — tables for review ONLY.
-- DO NOT APPLY without a separate explicit approval (see
-- docs/daily-content/PRODUCTION-READINESS.md). This file is local;
-- no production database was touched.
--
-- Design notes:
--  * Text refs, not UUIDs, for content identity: hadith refs are
--    `hadith:<hadiths.id>` (text PK) and card refs are `content:<slug>`.
--    (The existing scheduler_notification_runs.content_id is UUID, which
--    cannot hold slugs — this schema does not repeat that mistake.)
--  * One publication per Asia/Kolkata date (UNIQUE kolkata_date + the
--    edge function's pre-insert check = no double publication).
--  * One delivery per (publication, device) (UNIQUE) = the "max one daily
--    notification per user" cap, enforced by the database, not just code.
--  * No religious text is graded here: cards/push JSONB carry verbatim
--    record fields + source lines only.
--  * Client writes are intentionally NOT opened: settings/publication/
--    delivery writes go through the service-role edge function. The
--    daily_content_preferences toggle is read by the edge function;
--    its client write path is a launch follow-up (see readiness doc).

create table if not exists public.daily_content_settings (
  id            int primary key default 1 check (id = 1),
  enabled       boolean not null default false,
  updated_at    timestamptz not null default now()
);

create table if not exists public.daily_content_publications (
  id                uuid primary key default gen_random_uuid(),
  kolkata_date      date not null unique,
  status            text not null default 'planned'
                    check (status in ('planned', 'published', 'failed')),
  hadith_ref        text,
  hadith_source_line text,
  cards             jsonb not null default '[]'::jsonb,
  push              jsonb,
  hadith_cycle      int not null default 1,
  card_cycle        int not null default 1,
  recipients_total  int not null default 0,
  recipients_sent   int not null default 0,
  recipients_failed int not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  published_at      timestamptz
);
create index if not exists idx_daily_pub_date
  on public.daily_content_publications (kolkata_date desc);

create table if not exists public.daily_content_deliveries (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references public.daily_content_publications(id) on delete cascade,
  token_id        uuid references public.device_push_tokens(id) on delete set null,
  device_id       text,
  platform        text not null default 'web',
  status          text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'retryable', 'disabled')),
  attempts        int not null default 0,
  max_attempts    int not null default 4,
  error           text,
  next_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint daily_delivery_one_per_device_per_day
    unique (publication_id, device_id)
);
create index if not exists idx_daily_deliv_retry
  on public.daily_content_deliveries (status, next_attempt_at)
  where status = 'retryable';

-- Per-device opt-out for the daily content push only. Absent row = the
-- device follows its general push subscription; daily_enabled = false
-- excludes it from daily sends without unsubscribing it from all pushes.
create table if not exists public.daily_content_preferences (
  device_id     text primary key,
  daily_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);

alter table public.daily_content_settings enable row level security;
alter table public.daily_content_publications enable row level security;
alter table public.daily_content_deliveries enable row level security;
alter table public.daily_content_preferences enable row level security;

-- Admin check via public.is_admin(auth.uid()) (user_roles table),
-- the same function the app's existing policies use. The old
-- email-list table is no longer referenced.
-- Plus: published rows are public by definition (the homepage card reads
-- today's row anonymously), so SELECT is open for status='published' only.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'daily_content_publications' and policyname = 'Public can read published rows') then
    create policy "Public can read published rows" on public.daily_content_publications
      for select using (status = 'published');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_settings' and policyname = 'Admins full access') then
    create policy "Admins full access" on public.daily_content_settings
      for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_publications' and policyname = 'Admins read publications') then
    create policy "Admins read publications" on public.daily_content_publications
      for select using (public.is_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_deliveries' and policyname = 'Admins read deliveries') then
    create policy "Admins read deliveries" on public.daily_content_deliveries
      for select using (public.is_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_preferences' and policyname = 'Admins read preferences') then
    create policy "Admins read preferences" on public.daily_content_preferences
      for select using (public.is_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_publications' and policyname = 'Service writes publications') then
    create policy "Service writes publications" on public.daily_content_publications
      for all using (auth.role() = 'service_role');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_deliveries' and policyname = 'Service writes deliveries') then
    create policy "Service writes deliveries" on public.daily_content_deliveries
      for all using (auth.role() = 'service_role');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_settings' and policyname = 'Service writes settings') then
    create policy "Service writes settings" on public.daily_content_settings
      for all using (auth.role() = 'service_role');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'daily_content_preferences' and policyname = 'Service writes preferences') then
    create policy "Service writes preferences" on public.daily_content_preferences
      for all using (auth.role() = 'service_role');
  end if;
end $$;

-- Seed: automation starts PAUSED. Enabling is a launch decision, not a default.
insert into public.daily_content_settings (id, enabled)
values (1, false)
on conflict (id) do nothing;
