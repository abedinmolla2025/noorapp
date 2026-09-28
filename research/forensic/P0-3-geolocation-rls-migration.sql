-- ═══════════════════════════════════════════════════════════════════════════════
-- P0-3 GEOLOCATION PRIVACY — RLS HARDENING MIGRATION  *** PROPOSAL ONLY ***
-- ═══════════════════════════════════════════════════════════════════════════════
-- STATUS:  PENDING PRIVILEGED EXECUTION.  DO NOT APPLY without explicit human
--          authorization.  This file was prepared read-only as part of the
--          P0-3 (TRK3-1703) remediation; no policy in it has been executed.
--
-- PROBLEM (audit TRK3-1703, direct measurement): an anonymous REST probe
-- returned live rows from public.user_notification_preferences including
-- millimetre-precision coordinates (e.g. latitude 22.48033000 /
-- longitude 87.99327340), device_id, timezone and calculation_method.
-- The SELECT policy `USING (user_id IS NULL OR user_id = auth.uid())` makes
-- EVERY logged-out device row world-readable, and Supabase REST answers
-- `Access-Control-Allow-Origin: *`, so any third-party site can harvest
-- precise user locations from visitors' browsers.
--
-- WHAT THIS MIGRATION DOES (single transaction):
--   1. Coarsens ALL stored coordinates to 2 decimals (~1.1 km grid) — the
--      P0-3 precision cap. Prayer-time math shifts by seconds at that
--      granularity; no feature needs more.
--   2. De-duplicates device_id (keeps the most recently updated row) and
--      enforces UNIQUE(device_id) so the client's SELECT-free upsert is
--      reliable.
--   3. Removes EVERY policy variant that makes NULL-user (logged-out) rows
--      anonymously readable, across all three historical naming schemes.
--   4. SELECT becomes owner-only: authenticated users read only rows whose
--      user_id = auth.uid(); admins keep full read via is_admin().
--      Anonymous callers get ZERO rows (fail-closed).
--   5. INSERT / UPDATE / DELETE stay device-scoped for anon+authenticated:
--      anonymous callers may only touch rows with user_id IS NULL (their own
--      unguessable-UUID device row); they can never attach rows to a user
--      account or read anyone's coordinates. Authenticated users may additionally
--      own rows via user_id = auth.uid().
--
-- DELIBERATE RESIDUAL (product decision, flagged not fixed):
--   Anonymous coordinate *writes* remain possible (device-scoped, unguessable
--   UUID key). Removing them entirely would kill server-side prayer
--   notifications for logged-out users; requiring authentication for writes
--   is a product call. The client now (a) coarsens to 2 decimals before
--   sending, (b) validates pairs, and (c) only syncs after explicit
--   location consent — see src/lib/notificationPreferences.ts.
--
-- ROLLBACK: re-run the 2026-08-14 policy definitions from
--   supabase/migrations/20260814110000_fix_public_notification_preferences_rls.sql
--   to restore the previous device-scoped read path. (Stored coordinates stay
--   coarsened — that part is intentionally irreversible.)
--
-- VERIFICATION (run after COMMIT, before closing the task):
--   V1. Zero over-precise rows (expect 0).
--   V2. Policy listing shows no USING (true) / user_id-IS-NULL SELECT.
--   V3. Anonymous REST probe returns [] (curl template below).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Coarsen every stored coordinate to the 2-decimal policy ───────────────
UPDATE public.user_notification_preferences
SET
  latitude  = ROUND(latitude::numeric, 2),
  longitude = ROUND(longitude::numeric, 2);

-- ── 2. Deduplicate device_id, then enforce uniqueness ────────────────────────
DELETE FROM public.user_notification_preferences a
USING public.user_notification_preferences b
WHERE a.device_id = b.device_id
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id > b.id)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_preferences_device_id_key'
  ) THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT user_notification_preferences_device_id_key UNIQUE (device_id);
  END IF;
END
$$;

-- ── 3. Drop every policy that makes logged-out rows anonymously readable ─────
-- (all historical naming schemes; IF EXISTS keeps this idempotent)
DROP POLICY IF EXISTS "Public can read own device preference"   ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Anyone can manage their device preferences"  ON public.user_notification_preferences;

DROP POLICY IF EXISTS "Public can insert device preference"    ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.user_notification_preferences;

DROP POLICY IF EXISTS "Public can update device preference"    ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.user_notification_preferences;

DROP POLICY IF EXISTS "Users can delete own notification preferences" ON public.user_notification_preferences;

DROP POLICY IF EXISTS "Admins can view all notification preferences" ON public.user_notification_preferences;

-- ── 4. Owner-only SELECT (P0-3 core fix) ─────────────────────────────────────
-- Anonymous callers match NO policy below -> zero rows, fail-closed.
CREATE POLICY "P0-3: owners read own notification preferences"
  ON public.user_notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins keep full read (function is_admin(uuid) already exists in this DB).
CREATE POLICY "Admins can view all notification preferences"
  ON public.user_notification_preferences
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- ── 5. Device-scoped writes (no anonymous reads involved) ───────────────────
-- INSERT: anon may only create user-less device rows; authenticated users may
-- additionally create rows owned by themselves.
CREATE POLICY "P0-3: device-scoped insert"
  ON public.user_notification_preferences
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    ((user_id IS NULL) AND (auth.uid() IS NULL))
    OR (auth.uid() = user_id)
  );

-- UPDATE: anon may only update user-less rows (reachable in practice only via
-- the conflicting unguessable device_id on upsert); owners may update theirs.
-- Keeps the DB calculation_method allow-list from the original policy.
CREATE POLICY "P0-3: device-scoped update"
  ON public.user_notification_preferences
  FOR UPDATE
  TO anon, authenticated
  USING (
    ((user_id IS NULL) AND (auth.uid() IS NULL))
    OR (auth.uid() = user_id)
  )
  WITH CHECK (
    (
      ((user_id IS NULL) AND (auth.uid() IS NULL))
      OR (auth.uid() = user_id)
    )
    AND calculation_method IN ('MWL', 'ISNA', 'Egypt', 'Makkah', 'Karachi', 'Tehran', 'Jafari')
  );

-- DELETE: device owners (or row owners) may remove their own row.
CREATE POLICY "P0-3: device-scoped delete"
  ON public.user_notification_preferences
  FOR DELETE
  TO anon, authenticated
  USING (
    ((user_id IS NULL) AND (auth.uid() IS NULL))
    OR (auth.uid() = user_id)
  );

-- Grants (policies, not grants, are the enforcement point).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_preferences TO anon, authenticated;

-- ── 6. Read-only verification (run AFTER commit) ─────────────────────────────
-- V1: expect 0 — no row keeps more than 2 decimals.
-- SELECT count(*) AS overprecise_rows
-- FROM public.user_notification_preferences
-- WHERE latitude::text ~ '\.\d{3,}' OR longitude::text ~ '\.\d{3,}';
--
-- V2: expect only the four P0-3 policies (+ nothing with USING (true)).
-- SELECT policyname, cmd, roles::text AS roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'user_notification_preferences'
-- ORDER BY policyname;
--
-- V3: anonymous REST probe — expect [] (run from any shell, anon key only).
-- curl -s "$SUPABASE_URL/rest/v1/user_notification_preferences?select=id,latitude,longitude&limit=5" \
--   -H "apikey: $SUPABASE_ANON_KEY" \
--   -H "Authorization: Bearer $SUPABASE_ANON_KEY"
--
-- V4: service-role read still works (server cron path unaffected).
-- (Run with the service-role key; expect the full row set.)
-- ═══════════════════════════════════════════════════════════════════════════════

COMMIT;
