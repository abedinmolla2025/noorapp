-- Restore anonymous PWA access for device-scoped prayer notification preferences.
-- The project has used two compatible schemas over time: one with user_id and one
-- with device_id only. Keep the policy safe for both instead of assuming one schema.

DO $$
DECLARE
  has_user_id boolean;
BEGIN
  IF to_regclass('public.user_notification_preferences') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notification_preferences'
      AND column_name = 'user_id'
  ) INTO has_user_id;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO anon, authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO anon, authenticated';

  DROP POLICY IF EXISTS "Public can read own device preference" ON public.user_notification_preferences;
  DROP POLICY IF EXISTS "Public can insert device preference" ON public.user_notification_preferences;
  DROP POLICY IF EXISTS "Public can update device preference" ON public.user_notification_preferences;

  IF has_user_id THEN
    CREATE POLICY "Public can read own device preference"
      ON public.user_notification_preferences
      FOR SELECT
      TO anon, authenticated
      USING (user_id IS NULL OR user_id = auth.uid());

    CREATE POLICY "Public can insert device preference"
      ON public.user_notification_preferences
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (user_id IS NULL OR user_id = auth.uid());

    CREATE POLICY "Public can update device preference"
      ON public.user_notification_preferences
      FOR UPDATE
      TO anon, authenticated
      USING (user_id IS NULL OR user_id = auth.uid())
      WITH CHECK (user_id IS NULL OR user_id = auth.uid());
  ELSE
    CREATE POLICY "Public can read own device preference"
      ON public.user_notification_preferences
      FOR SELECT
      TO anon, authenticated
      USING (true);

    CREATE POLICY "Public can insert device preference"
      ON public.user_notification_preferences
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);

    CREATE POLICY "Public can update device preference"
      ON public.user_notification_preferences
      FOR UPDATE
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- DROP POLICY IF EXISTS "Public can read own device preference" ON public.user_notification_preferences;
-- DROP POLICY IF EXISTS "Public can insert device preference" ON public.user_notification_preferences;
-- DROP POLICY IF EXISTS "Public can update device preference" ON public.user_notification_preferences;
