# NoorApp Daily Content — Launch Runbook

Owner-operated, step by step. NOTHING in this runbook has been
executed. Each numbered step needs its own owner approval before it
is performed; approval for one step is not approval for the next.
Stop at any step whose verification fails, and do not proceed to the
next step until it passes.

Preconditions (all true at the time of writing):

- Code: branch `muse/daily-content-auto-2026-11-03`, change commit
  recorded in DAILY-CONTENT-LAUNCH-READINESS-REPORT.md §2 (starting
  commit `1a49613` + hardening + policies, local only, never pushed).
- System state: DISABLED, unmigrated, undeployed, no cron registered,
  no publication, no send.
- This runbook assumes the migration file
  `supabase/migrations/202611030001_daily_content.sql` is applied
  exactly as reviewed (CHECKLIST-MIGRATION-RLS.md). Do not edit it
  during launch; if it must change, stop and re-review.

## Step 1 — Review migration and schema compatibility

Owner action: read CHECKLIST-MIGRATION-RLS.md and the migration file.
Verify: the four tables, constraints, and policies match the review;
production `device_push_tokens` has the columns the edge reads
(`id`, `token`, `platform`, `device_id`, `enabled`).
Verify: whether `public.admin_users` exists in production.
Decision needed before Step 3: if `admin_users` is absent, decide
whether to create it out-of-band or add a migration for it
(see REMAINING-APPROVALS.md). Do not proceed to Step 3 with this
undecided if admin-page reads are required for launch monitoring.
Stop condition: any schema incompatibility (missing column, type
mismatch, conflicting table) → stop, report, do not apply.

## Step 2 — Verify required configuration presence

Owner action: confirm presence (names only, never values) per
CHECKLIST-CONFIG.md:
Vercel project `noorappold`: `DAILY_CONTENT_CRON_SECRET` set;
`SUPABASE_URL` already present.
Supabase Edge Function secrets for `daily-content`:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_VAPID_PRIVATE_KEY` (the EXISTING
pair — verify pair consistency, never generate a new pair),
`DAILY_CONTENT_CRON_SECRET` (same value as the Vercel var).
Verification method for each item is in CHECKLIST-CONFIG.md.
Stop condition: any required item missing, or the VAPID pair
inconsistent → stop. Never print a secret value to prove presence.

## Step 3 — Apply migration (ONLY after explicit approval)

Owner action: apply `202611030001_daily_content.sql` to production.
Then verify in production (read-only queries): all four tables
exist; RLS enabled on all four; UNIQUE constraints present
(`kolkata_date`, `publication_id + device_id`); policies listed
(public published-only SELECT, admin policies, service-role
policies); seed row `daily_content_settings (id=1, enabled=false)`
present — the system must start PAUSED.
Stop condition: any verification mismatch → stop, do not deploy,
assess whether a repair migration is needed (separate approval).

## Step 4 — Deploy the Edge Function (ONLY after explicit approval)

Owner action: deploy `supabase/functions/daily-content` with the
secrets from Step 2.
Then verify: an unauthenticated/ wrong-secret call returns 401;
an authenticated dry-run call returns a plan (see Step 5) — never a
publication. Confirm the deployed code is the reviewed commit (the
hardening + policies), not an older or newer tree.
Stop condition: 401 check fails (auth misconfigured) or the deployed
version cannot be confirmed → stop, do not enable.

## Step 5 — Run real-path dry-run and inspect results

Owner action: perform the owner-operated dry-run exactly as specified
in CHECKLIST-DRY-RUN.md (authenticated `?dry_run=1` call through the
Vercel endpoint, or the equivalent edge call with `dry_run: true`).
Inspect: the returned plan (hadith + cards + push payload), and
confirm no publication or delivery rows were created and no
notification was sent.
Stop condition: any acceptance criterion in CHECKLIST-DRY-RUN.md
fails → stop. Launch remains blocked until the dry-run passes.

## Step 6 — Verify at least one eligible Hadith

Owner action: from the dry-run plan, confirm the Hadith slot is
filled (not an empty reason) and that the record satisfies the
eligibility rule: Arabic present, Bengali present, hadith number
present, book key present. Confirm the Arabic and Bengali text match
the production record verbatim, and the reference/canonical URL is
the book page (no guessed per-hadith deep link).
Stop condition: empty Hadith slot, missing field, or any text
mismatch → launch remains BLOCKED. Never fill a missing field, never
invent a reference, never substitute another record's text.

## Step 7 — Enable Daily Content (ONLY after explicit approval)

Owner action: set `daily_content_settings.enabled = true` for
`id = 1` via the owner dashboard/SQL path (the admin UI has no
settings write policy — see the readiness report §12).
Verify: the settings row reads `enabled = true`; the system is
otherwise unchanged (no publication created by enabling alone —
enabling only gates future runs).
Note: enabling does NOT schedule anything. Without Step 8/9, nothing
runs.

## Step 8 — Register the daily 06:00 Asia/Kolkata cron

Owner action: register ONE daily trigger — Vercel Cron on
`api/daily-content-run` with schedule `30 0 * * *` (00:30 UTC =
06:00 Asia/Kolkata; IST has no DST) — OR a Supabase pg_cron call to
the edge function at the same time. Pick ONE, never both (a double
trigger is harmless due to published-date idempotency, but one is
cleaner and easier to audit).
Verify: the schedule is registered, points at the correct endpoint,
and carries the correct bearer secret (presence only).
Note: the first daily run after registration will publish that day's
content. Register in the morning after 06:00 IST if the owner wants
the first publication to be the NEXT day's, not today's remainder —
or accept that the first run publishes for the current date.

## Step 9 — Register the 15-minute retry cron

Owner action: register the retry trigger — same endpoint with
`retry_only=1` (body `{ "retry_only": true }`) every 15 minutes,
same secret. This is what recovers failed deliveries and today's
planned publication within the day (see the readiness report).
Verify: the schedule is registered and its payload is retry-only
(a retry tick must never plan or publish).
Note: retry ticks now respect the pause gate (decided policy), so
pausing stops retries too.

## Step 10 — Verify the first publication and delivery

Owner action: after the first daily run, verify in production:
one publication row for the date, status `published`, with the
expected hadith ref and card count; delivery rows `sent` for
enabled, opted-in devices; recipients counts on the publication
match the delivery rows; no duplicate delivery per device; no
delivery for opted-out devices; failed rows (if any) carry a
structured error and a retryable status with a future
`next_attempt_at` where applicable.
Stop condition: duplicate delivery, delivery to an opted-out device,
or a publication in an unexpected state → pause (see rollback plan)
and investigate before the next run.

## Step 11 — Verify Android Chrome push behavior

Owner action: on a subscribed Android Chrome device, confirm: the
notification arrives, tapping it opens the correct canonical link,
the DailyHadith card shows the published hadith, and the share cards
render verbatim. Confirm a disabled/uninstalled subscription is
cleaned up on the next run (410 → token disabled, no repeated sends
to the dead token).
Stop condition: broken tap target, wrong content, or repeated sends
to a dead token → pause and investigate.

## Step 12 — Monitor failed jobs, retries, duplicates, publication status

Owner action (ongoing): after launch, monitor daily: publication
status per date (published vs failed vs stranded planned);
delivery outcomes (sent/failed/retryable counts per publication);
retryable rows aging past their backoff (a row stuck retryable
across days indicates a provider or token problem, not normal
backoff); duplicate deliveries per device (must be zero except the
documented at-least-once cases in the readiness report §10);
failed jobs (edge errors, auth failures, timeouts).
Escalation: any systematic duplicate, any stale notification, or any
failed publication two days running → pause per the rollback plan
and investigate before re-enabling.
