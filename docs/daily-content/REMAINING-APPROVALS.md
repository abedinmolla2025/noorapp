# Remaining Owner Approvals — Daily Content Launch

Every item below needs its own separate owner message. Approval for
one item is not approval for any other. Items are in dependency
order; do not skip ahead (e.g. do not approve enablement before the
dry-run passes).

Engineering state (for reference, not approval): the hardening
changes and decided policies are implemented locally and tested
(DAILY-CONTENT-LAUNCH-READINESS-REPORT.md). The branch remains
local-only, never pushed, never merged.

## Approvals still required

1. **Migration/schema review sign-off** — accept the migration/RLS
   review (CHECKLIST-MIGRATION-RLS.md) and the schema-compatibility
   findings, including the `device_push_tokens` compatibility check.
2. **`admin_users` decision** — if `public.admin_users` is absent in
   production, decide: create it out-of-band (owner dashboard/SQL
   with the admin email list), or approve a follow-up migration
   creating it. If it exists, confirm and close this item.
3. **Migration application** — apply
   `supabase/migrations/202611030001_daily_content.sql` to
   production, then verify tables, constraints, RLS, policies, and
   the paused seed row (runbook Step 3).
4. **Configuration presence confirmation** — confirm the
   configuration matrix (CHECKLIST-CONFIG.md) is satisfied in
   production (names only, never values), including VAPID pair
   consistency. Note: confirming presence is an owner verification;
   setting any missing secret is itself a separate owner action.
5. **Edge Function deployment** — deploy
   `supabase/functions/daily-content` (the reviewed commit, with
   hardening + policies) with the secrets from item 4, then verify
   auth (401 without the secret) and version (runbook Step 4).
6. **Real-path dry-run execution** — run the owner-operated dry-run
   (CHECKLIST-DRY-RUN.md) and accept its results. This item is only
   closable by a passing dry-run, including at least one eligible
   Bengali Hadith with verbatim text.
7. **Enablement** — set `daily_content_settings.enabled = true`
   (owner dashboard/SQL path; the admin UI cannot write settings).
   Enabling alone schedules nothing.
8. **Daily cron registration** — register ONE daily trigger,
   `30 0 * * *` (00:30 UTC = 06:00 Asia/Kolkata), Vercel Cron or
   Supabase pg_cron (runbook Step 8).
9. **Retry cron registration** — register the 15-minute retry trigger
   with `retry_only=1` (runbook Step 9).
10. **First-run watch sign-off** — after the first publication,
    accept the verification in runbook Steps 10–11 (publication +
    delivery rows, Android Chrome push behavior) and the ongoing
    monitoring in Step 12.

## Decisions still open (not launch-blocking unless noted)

- **Preferences toggle follow-up**: ship launch without a
  user-facing daily toggle, or approve the follow-up client-write
  policy + UI work. Not launch-blocking (opt-outs work via
  service-role paths; users can still disable push entirely), but
  decide before promising users a daily toggle.
- **`deliveries.device_id` nullability**: accept the nullable column
  and the bounded legacy-row residual, or approve a follow-up
  migration tightening it. Not launch-blocking (the edge never
  creates NULL-device rows now).
- **VAPID rotation**: NOT approved, NOT needed, NOT part of launch
  or rollback. Any future rotation needs its own migration +
  subscription-impact review.
- **Index.tsx DailyHadithContainer swap**: the container that reads
  today's published row is built but NOT yet swapped into the
  homepage (launch step from earlier planning). Swapping it changes
  the live homepage and needs its own approval + a deployment —
  separate from the automation launch above. Until it is swapped,
  publications exist but the homepage card still shows the original
  rotation.

## Explicitly NOT approved by this package

- No merge, no push to GitHub, no production deployment beyond item
  5's edge-function deploy (and item 10's homepage swap, if
  separately approved).
- No AdSense action, no GSC action, no settings change beyond the
  Daily Content flag in item 7.
- No database write beyond the migration (item 3), the settings flag
  (item 7), and the automation's own runtime writes after launch.
- No change to Bilal content, unrelated features, or religious
  content of any kind.
