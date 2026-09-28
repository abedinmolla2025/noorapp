-- ============================================================================
-- P0-2 stale-schedule remediation — PREPARED, NOT EXECUTED.
-- ============================================================================
-- Context (2026-09-28 forensic audit, INC-2026-09-28-scheduler-tick):
--   scheduler_schedules holds 8 rows, 6 of them enabled, with next_run_at
--   stale (Aug 2026) and last_sent_at NULL or <= 2026-08-17. If the
--   scheduler-dispatch edge function ever runs healthy while unauthenticated,
--   the bulk path would fire all 6 stale schedules at every subscribed device
--   (16 enabled web tokens).
--
-- DO NOT RUN this file blindly. It requires deliberate, privileged execution
-- (Supabase SQL Editor / dashboard as postgres or service_role):
--   1. Run ONLY the "PRE-FLIGHT IDENTIFICATION" SELECT first.
--   2. Confirm the returned rows are exactly the 6 stale enabled schedules
--      (names should match the seed set: Jumuah / morning / evening / sleep /
--      fasting reminders + whichever extra schedule was enabled later).
--   3. If and only if the identification matches, run the TRANSACTION block.
--   4. Run the VERIFICATION selects and keep their output as evidence.
--
-- The live row IDs could not be captured from the remediation sandbox (the
-- Supabase connector credential is not available to the sandbox), so the
-- UPDATE targets rows deterministically instead of by hardcoded IDs:
--   enabled = true AND next_run_at < now() - interval '7 days'
-- Per the 2026-09-28 incident evidence this predicate selects exactly the
-- 6 stale enabled schedules and nothing else. The transaction captures the
-- affected IDs and RAISEs them as NOTICE for the audit trail.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PRE-FLIGHT IDENTIFICATION (read-only; run first, review output)
-- ----------------------------------------------------------------------------
SELECT id,
       name,
       kind,
       enabled,
       time_at,
       tz,
       islamic_event,
       next_run_at,
       last_sent_at,
       target
FROM   public.scheduler_schedules
WHERE  enabled = true
  AND  next_run_at < now() - interval '7 days'
ORDER  BY name;

-- Expected: exactly the 6 stale enabled rows. If this returns anything else
-- (0 rows, or rows you do NOT want disabled), STOP — do not run the block below.

-- ----------------------------------------------------------------------------
-- TRANSACTION: disable stale schedules + retire the legacy pg_cron dispatcher
-- ----------------------------------------------------------------------------
BEGIN;

-- Capture the exact set we are about to change (audit trail).
CREATE TEMP TABLE p02_stale_targets ON COMMIT DROP AS
SELECT id, name
FROM   public.scheduler_schedules
WHERE  enabled = true
  AND  next_run_at < now() - interval '7 days';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM p02_stale_targets ORDER BY name LOOP
    RAISE NOTICE 'P0-2 disabling stale schedule: % (%)', r.name, r.id;
  END LOOP;
END $$;

-- Disable the stale schedules (defensive: keep next_run_at so a future
-- deliberate re-enable can recompute from a sane base via
-- scheduler_compute_next_run).
UPDATE public.scheduler_schedules s
SET    enabled     = false,
       updated_at  = now()
FROM   p02_stale_targets t
WHERE  s.id = t.id;

-- Retire the legacy pg_cron dispatcher.
-- Rationale: migration 20260808_001_scheduler_schema.sql schedules
-- 'noor-scheduler-dispatch' to POST the edge function every minute with
-- `Authorization: Bearer <service_role_key>`. The new P0-2 gate accepts only
-- the SCHEDULER_CRON_SECRET or an admin JWT, so the legacy job would now 401
-- every minute (log noise, masked failures). The Vercel Cron target
-- /api/scheduler-tick (shared secret) is the single authorized bulk path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'noor-scheduler-dispatch') THEN
    PERFORM cron.unschedule('noor-scheduler-dispatch');
    RAISE NOTICE 'P0-2 unscheduled legacy pg_cron job noor-scheduler-dispatch';
  ELSE
    RAISE NOTICE 'P0-2 legacy pg_cron job noor-scheduler-dispatch not present; nothing to unschedule';
  END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFICATION (run after COMMIT; keep output as evidence)
-- ----------------------------------------------------------------------------
-- 1. No enabled schedule may be stale anymore:
SELECT count(*) AS stale_enabled_remaining
FROM   public.scheduler_schedules
WHERE  enabled = true
  AND  next_run_at < now() - interval '7 days';
-- Expected: 0

-- 2. Full schedule state after the change:
SELECT id, name, kind, enabled, next_run_at, last_sent_at
FROM   public.scheduler_schedules
ORDER  BY name;

-- 3. Legacy dispatcher gone:
SELECT count(*) AS legacy_cron_jobs_remaining
FROM   cron.job
WHERE  jobname = 'noor-scheduler-dispatch';
-- Expected: 0

-- ----------------------------------------------------------------------------
-- ALTERNATIVE (only if the owner decides pg_cron must remain the dispatcher):
-- store the shared secret in vault and re-point the job at it. NOT the
-- recommended path; the Vercel Cron + shared secret is the single dispatch
-- path after P0-2. Kept here for completeness — do not run both.
-- ----------------------------------------------------------------------------
-- -- store once (replace the placeholder in a privileged session only):
-- insert into vault.decrypted_secrets (name, secret)
-- values ('scheduler_cron_secret', 'PASTE_REAL_SCHEDULER_CRON_SECRET_HERE')
-- on conflict (name) do update set secret = excluded.secret;
--
-- select cron.schedule(
--   'noor-scheduler-dispatch',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := 'https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/scheduler-dispatch',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_cron_secret')
--     ),
--     body := jsonb_build_object('dispatch_at', now()::text)::text
--   );
--   $$
-- );
