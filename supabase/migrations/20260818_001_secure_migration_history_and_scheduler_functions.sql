-- Protect migration bookkeeping from public API access.
-- These tables are not used by the client application; the service role and
-- database owner retain the access required for administrative operations.
alter table public._supabase_migrations enable row level security;
alter table public.supabase_migrations enable row level security;

revoke all privileges on table public._supabase_migrations from anon, authenticated;
revoke all privileges on table public.supabase_migrations from anon, authenticated;

-- Pin function resolution to trusted schemas. Both functions retain their
-- current SECURITY INVOKER behavior; this only removes a mutable search_path.
alter function public.scheduler_compute_next_run(public.scheduler_schedules, text)
  set search_path to pg_catalog, public;

alter function public.scheduler_touch_next_run()
  set search_path to pg_catalog, public;
