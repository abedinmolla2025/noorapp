-- Phase 2 (2026-11-10): scheduler-dispatch pg_cron caller update.
--
-- WHAT CHANGES: the pg_cron job 'noor-scheduler-dispatch' previously
-- authenticated to the scheduler-dispatch Edge Function with the
-- SERVICE-ROLE key stored in vault ('service_role_key'). The Edge
-- Function now enforces a dual-mode gate: the bulk path accepts ONLY
-- the dedicated cron secret SCHEDULER_CRON_SECRET. A service-role
-- Bearer token is REJECTED (401) on the bulk path, so the old job
-- would stop working the moment the gated Edge Function deploys.
-- This migration re-points the job at the dedicated vault secret
-- 'scheduler_cron_secret' (same value as the Supabase edge secret
-- SCHEDULER_CRON_SECRET and the Vercel env var of the same name).
--
-- OWNER STEP (before this migration runs — value never in this file):
--   1. Create a fresh random secret value (e.g. 32+ random bytes).
--   2. Set it as the Supabase Edge Function secret SCHEDULER_CRON_SECRET
--      (Dashboard -> Edge Functions -> Manage secrets) AND as the
--      Vercel env var SCHEDULER_CRON_SECRET (used by api/scheduler-tick.ts).
--   3. Store the SAME value in vault (run once, owner-run in SQL Editor):
--        insert into vault.decrypted_secrets (name, secret)
--        values ('scheduler_cron_secret', '<owner-created value>')
--        on conflict (name) do update set secret = excluded.secret;
--   4. Only then run this migration.
--
-- FAIL-CLOSED: if 'scheduler_cron_secret' is NOT in vault, this
-- migration does NOT create/replace the job — it raises a NOTICE and
-- leaves the old job untouched, so a half-configured state cannot
-- silently break (or silently keep) dispatch. The old job keeps
-- running against the UNGATED function until the gated function
-- deploys; deploy order is in PHASE2-DEPLOYMENT-DEPENDENCY-MAP.md
-- (secret + migration + gated function land together, Gate 1 first).
--
-- This file is a CANDIDATE ONLY. Do NOT run it against production
-- without the Gate 1 backup + the owner approvals (plan, backup,
-- recovery, explicit authorization). HARD GATE 0 is ACTIVE.
-- No secret value appears in this file.

do $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'scheduler_cron_secret';

  if v_secret is null or btrim(v_secret) = '' then
    raise notice 'Phase 2: vault secret ''scheduler_cron_secret'' is NOT set — pg_cron job NOT created/updated. Set the secret (owner step) and re-run this migration.';
    return;
  end if;

  -- Replace the job (drop-then-create: cron.schedule has no upsert).
  if exists (select 1 from cron.job where jobname = 'noor-scheduler-dispatch') then
    perform cron.unschedule('noor-scheduler-dispatch');
  end if;

  perform cron.schedule(
    'noor-scheduler-dispatch',
    '* * * * *',
    $$
    select net.http_post(
      url := 'https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/scheduler-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Dedicated cron secret ONLY. Never the service-role key:
        -- the gated bulk path rejects service-role Bearer tokens.
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_cron_secret'
        )
      ),
      body := jsonb_build_object('dispatch_at', now()::text)::text
    );
    $$
  );
  raise notice 'Phase 2: pg_cron job ''noor-scheduler-dispatch'' now authenticates with the dedicated scheduler_cron_secret.';
end $$;
