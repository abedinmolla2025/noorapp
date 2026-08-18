-- Explicitly document that client roles must never access migration bookkeeping.
-- These policies preserve the existing deny-by-default RLS behavior while
-- removing the advisor's informational "RLS Enabled No Policy" notice.
create policy "deny_client_access_to__supabase_migrations"
on public._supabase_migrations
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_client_access_to_supabase_migrations"
on public.supabase_migrations
for all
to anon, authenticated
using (false)
with check (false);
