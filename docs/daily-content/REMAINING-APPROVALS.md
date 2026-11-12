# Remaining Owner Approvals — Daily Content Launch

Every item below needs its own separate owner message. Approval for
one item is not approval for any other. Items are in dependency
order; do not skip ahead (e.g. do not approve enablement before the
dry-run passes).

Engineering state (for reference, not approval): the hardening
changes and decided policies are implemented locally and tested
(DAILY-CONTENT-LAUNCH-READINESS-REPORT.md). The migration file now
carries the Option C correction (`public.is_admin(auth.uid())`
admin policies; local change awaiting owner review). The branch
remains local-only, never pushed, never merged.

## Approvals still required

1. **Migration/schema review sign-off** — accept the migration/RLS
   review (CHECKLIST-MIGRATION-RLS.md, including the new §G intended
   grant set and 8-privilege matrix) and the schema-compatibility
   findings, including the `device_push_tokens` compatibility check.
2. **Option C migration correction review** — review and approve
   the corrected migration (all four admin policies use
   `public.is_admin(auth.uid())`; settings FOR ALL with explicit
   USING and WITH CHECK; public published-only and service-role
   policies unchanged). The superseded email-list decision
   (create it out-of-band, or a follow-up migration creating it) is
   closed: no email-list admin table is required, and those options
   must not be followed. Until this correction is approved, the
   migration must not be applied.
3. **Migration application** — apply the Option C–corrected
   `supabase/migrations/202611030001_daily_content.sql` to
   production, then run the post-migration verification gate
   (tables, constraints, RLS, policies, paused seed row, and the
   8-privilege matrix per CHECKLIST-MIGRATION-RLS.md §G;
   runbook Step 3).
4. **Post-migration grants narrowing approval** — approve any
   permission change needed to bring the measured matrix to the
   written intended grant set, including any REVOKE. No narrowing
   (GRANT or REVOKE) may be performed under the migration-apply
   approval or any other approval; without this approval, the
   matrix gate cannot be closed by changing permissions.
5. **Configuration presence confirmation** — confirm the
   configuration matrix (CHECKLIST-CONFIG.md) is satisfied in
   production (names only, never values), including VAPID pair
   consistency. Note: confirming presence is an owner verification;
   setting any missing secret is itself a separate owner action.
6. **Edge Function deployment** — deploy
   `supabase/functions/daily-content` (the reviewed commit, with
   hardening + policies) with the secrets from item 5 and with
   `verify_jwt = false` specified explicitly, then verify
   auth (401 without the secret) and version (runbook Step 4).
7. **Real-path dry-run execution** — run the owner-operated dry-run
   (CHECKLIST-DRY-RUN.md) and accept its results. This item is only
   closable by a passing dry-run, including at least one eligible
   Bengali Hadith with verbatim text.
8. **Enablement** — set `daily_content_settings.enabled = true`
   (owner dashboard/SQL path; the admin UI cannot write settings).
   Enabling alone schedules nothing.
9. **Daily cron registration** — register ONE daily trigger,
   `30 0 * * *` (00:30 UTC = 06:00 Asia/Kolkata), Vercel Cron or
   Supabase pg_cron (runbook Step 8).
10. **Retry cron registration** — register the 15-minute retry trigger
   with `retry_only=1` (runbook Step 9).
11. **First-run watch sign-off** — after the first publication,
    accept the verification in runbook Steps 10–11 (publication +
    delivery rows, Android Chrome push behavior) and the ongoing
    monitoring in Step 12.
12. **Send-path fix review (R-5 + N-1, implemented locally
    2026-11-04, uncommitted)** — review the edge-function diff:
    first-send claim (10-minute `next_attempt_at` lease + tick/daily
    promotion guards, closing the daily-vs-tick double-send window)
    and retry-path opt-out enforcement (retryables for opted-out
    devices are closed terminally, plus a null-push guard), with
    three new edge tests (first-send opt-out, retry opt-out,
    daily-vs-tick overlap). Follow-up fixes in the same diff,
    also for review: published-pending strand recovery (ticks
    promote due pending rows of today's published publication),
    NULL-retryable selection + claim, and a status guard on the
    retry sent-update. No production effect until the edge
    deploy approval (item 6) covers this version.
    Update 2026-11-04: the final independent review (PASS FOR OWNER
    REVIEW) set three conditions, all remediated locally in this
    same uncommitted diff — `pushTimeoutMs` clamped to 300,000 ms
    (default 30,000 ms preserved), `runTick` returns
    `promotedPublished`, and a past-day non-revival edge test
    (yesterday's published pending row stays pending, 0 sends).
    Suite 56 unit + 52 edge, tsc 0, eslint 0. The midnight-spanning
    strand residual and the R-6 operational mitigation are unchanged.
13. **Residual acceptance** — explicitly accept the remaining
    documented at-least-once windows (crash after provider
    acceptance before the sent-update; late provider acceptance
    after a timeout; microsecond window between the post-claim
    parent re-check and the provider call) and the R-6 stale
    retryable behavior (mitigated by rollback-plan re-enable
    step 3). If zero known send defects are required instead,
    the mission is BLOCKED pending further fixes — say so
    explicitly rather than leaving the residuals implicit.

## Decisions still open (not launch-blocking unless noted)

- **Daily notification preference toggle — decision (Options A/B)**:
  - **Option A (recommended for first launch): ship WITHOUT a
    user-facing daily toggle.** Documented: users can disable push
    entirely (existing unsubscribe) and opt-outs work via
    service-role paths (dashboard/edge). Not launch-blocking. Do
    not promise users a daily toggle until Option B ships.
  - **Option B (follow-up track, needs its own approval +
    implementation + tests): edge-mediated toggle — NOT a client
    RLS policy.** Rationale: `daily_content_preferences` is keyed
    by `device_id`, which is client-generated and self-asserted; a
    permissive anon/authenticated INSERT/UPDATE policy on that
    table would let any client write any device's row (opt-out
    spoofing = silencing other devices' daily notifications).
    Design: a new edge route (or new function) accepting
    `{device_id, daily_enabled, endpoint}`; the edge verifies the
    presented subscription endpoint matches the stored token for
    that device_id (possession proof), then upserts via service
    role; no migration/policy change needed (the admin-SELECT
    policy is unchanged; the matrix gate is unaffected). UI: a
    "Daily Hadith notifications" toggle in the notification
    settings area, shown only when push is subscribed; on =
    default (no row), off = row `daily_enabled = false`; network
    failure reverts the toggle with an error. Tests required:
    endpoint verification (wrong endpoint → 403, unknown device
    → 404, bad body → 400), upsert behavior, UI states. Deploy
    impact: edge route deploy + app deploy, each separately
    approved. Until Option B is approved and shipped, Option A
    governs.
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
  6's edge-function deploy (and the homepage swap in 'Decisions
  still open', if separately approved).
- No AdSense action, no GSC action, no settings change beyond the
  Daily Content flag in item 8.
- No permission narrowing (GRANT or REVOKE) without the item 4
  approval — the migration-apply approval does not cover it.
- No database write beyond the migration (item 3), the settings flag
  (item 8), and the automation's own runtime writes after launch.
- No change to Bilal content, unrelated features, or religious
  content of any kind.
