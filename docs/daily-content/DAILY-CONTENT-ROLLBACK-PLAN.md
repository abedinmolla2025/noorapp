# NoorApp Daily Content — Rollback Plan

Purpose: stop all Daily Content activity quickly and safely, without
destroying evidence or breaking existing subscriptions. Nothing in
this plan has been executed. Each action is owner-operated.

Reconciled 2026-11-06 (Phases 7–8): re-enable step 3 updated — the
stale-retryable guard is now enforced in code (Phase 7), so the manual
review is a verification step, not the only safeguard. Rollback
targets added (app → `248abba`, edge → bundle v1/v2). The rest of this
document is unchanged.

Reconciled 2026-11-07 (AI mission Phase 11): edge rollback target
added — bundle **v3** is now the deployed version; rolling back to v2
reopens the Phase 9 integration (no approved-run consumption, no
`recommendation_id` writes). Recommend-function rollback added
(admin-gated; delete the function, never delete its rows). The three
new migrations are additive and are never dropped as a rollback step.
The re-enable procedure gained a step for the approved-run queue
(step 3b). The rest of this document is unchanged.

Trigger: any of — systematic duplicate deliveries, a stale
notification sent, a failed publication two days running, auth or
provider misconfiguration discovered after launch, or any other
production incident attributable to Daily Content. When in doubt,
pause first and investigate second: pausing is reversible and
lossless, while a day's bad sends are not.

## Rollback targets

- **App (frontend + endpoint + vercel.json):** Vercel → redeploy
  `248abba` (deployment `dpl_35bnbKEqdUuKpX7fyCmnG2FzJDSH`). The
  homepage falls back to the rotation card; the backend keeps running
  (paused) — the two halves are independent.
- **Edge:** Supabase Dashboard → redeploy bundle **v3**
  (`~/workspace/daily-content-deploy-bundle-v3/index.ts`, SHA-256
  `523577133ea90bdfe7c4a2c27754f42c6c42e2c6dd35f890f1ccb6dc6267bfd7`,
  74,691 bytes) is the current version; a rollback redeploys bundle
  **v2** (`~/workspace/daily-content-deploy-bundle-v2/index.ts`,
  SHA-256
  `c6327663f565a0de5ac5162b9034dd4cbe4c1998b2ed328fa4ab86805ba9308f`,
  62,535 bytes) with automation PAUSED. A v2 rollback reopens the
  Phase 9 integration (the planner stops consuming approved runs, and
  no `recommendation_id` is written — the column stays, harmlessly
  NULL), so it is safe only while paused or with the manual R-6 review
  (re-enable step 3) enforced. Bundle **v1** remains the last-resort
  fallback (`~/workspace/daily-content-deploy-bundle/index.ts`, SHA-256
  `e8e1c6643b84639ec01117e88b02ad5307e1984b825fc38b22be26b4de6d6470`,
  50,107 bytes); v1 additionally reopens the Phase 2/3/7 fixes
  (planner 5,000-row cap, opt-out pagination, R-6 code close).
- **Recommend function:** Supabase Dashboard → delete the
  `recommend-daily-content` function (or leave it deployed — it is
  admin-gated and writes only to its own table, so leaving it deployed
  while PAUSED is safe). Rolling it back does NOT delete rows from
  `daily_content_recommendations` — they are audit history, and the
  daily edge never reads a run whose status is not `approved`.
  Redeploying the function later uses the CLI bundle
  (`~/workspace/recommend-function-deploy-bundle/`, `index.ts`
  SHA-256
  `189d2fb89665f49b8d214bb4217e6518d5f7cdbbf710dbf754f43089e815780f`)
  because the Dashboard editor cannot resolve the `_shared` import.
- **Migrations (never dropped as a rollback step):** `202611070001`
  (calendar corrections), `202611070002` (recommendations table +
  approved-only public-read policy), and `202611070003`
  (`publications.recommendation_id`) are additive — dropping them
  would destroy audit history (approved runs, correction rows) and
  break the deployed app (the homepage reads approved runs; the edge
  writes `recommendation_id`). A rollback that removes the feature
  removes the CALLERS (app + edge + function), never the tables.
- **Never delete** publication/delivery rows as a rollback step (they
  are the audit trail), and never rotate VAPID keys as an incident
  response (step 5 below).

## Rollback procedure (in order)

### 1. Pause publication and retries

Set `daily_content_settings.enabled = false` for `id = 1` via the
owner dashboard/SQL path (the admin UI has no settings write policy).
Effect (decided policy): the daily branch returns `paused` and the
retry branch returns `paused`. No new publication is created, no
pending delivery is promoted, no retry is sent, no past planned row
is superseded while paused. In-flight runs already executing will
finish their current step but will not start new sends on the next
trigger.
Verify: the settings row reads `enabled = false`; the next scheduled
trigger returns the paused response.

### 2. Stop scheduler triggers

Disable (do not delete, until the incident review decides) both
schedules: the daily 06:00 Asia/Kolkata trigger and the 15-minute
retry trigger. Disabling rather than deleting preserves the schedule
definitions for a clean re-enable.
Verify: both schedules show disabled/paused in the scheduler UI; no
further trigger invocations appear in logs.

### 3. Preserve existing published content

Do NOT delete publication rows, delivery rows, or card/push payloads.
Published content already delivered stays as the historical record;
the homepage card reads today's published row (after the separately
approved homepage swap; before the swap, the homepage shows the
original rotation), and deleting it would break the card and destroy
the audit trail. If a published day's
content must be hidden for a content reason, that is a separate
content decision with its own approval — not part of this rollback.

### 4. Preserve delivery history

Do NOT delete or rewrite delivery rows. Delivery history is the
evidence for diagnosing the incident (which devices were sent, which
failed, which are retryable, what the errors were). Failed and
retryable rows left by the rollback stay in their states; they send
nothing while paused, and they can be inspected or explicitly failed
by a later, separately approved cleanup — never silently dropped.

### 5. Do NOT rotate VAPID keys

Do not rotate the VAPID key pair as part of rollback. A new pair
invalidates every existing browser subscription and turns a
contained incident into a fleet-wide re-subscription event. VAPID
rotation requires a separate migration and subscription-impact
review (see REMAINING-APPROVALS.md) and is never an incident
response by itself.

### 6. Assess and record

Record: what triggered the rollback, the last publication date and
status, delivery counts for that date, any duplicate or stale sends
(device count, not device identities in shared documents), and the
error strings observed. Keep this record with the incident, not in
the code tree, unless the owner asks for a written incident note.

## Re-enable procedure (after the incident is understood)

1. Fix the identified cause (code fix = new review + new tests;
   configuration fix = corrected presence, never a printed value;
   content fix = its own approval).
2. Run a real-path dry-run and accept it against
   CHECKLIST-DRY-RUN.md.
3. Review stale retryables before re-enabling: list
   `daily_content_deliveries` rows in status `retryable` for
   publications older than today. Since Phase 7 the code fails such
   rows terminally on the next tick (runRetries' date guard + the
   tick's stale-published close), so a long pause followed by
   re-enable no longer delivers stale notifications — but verify it:
   confirm the stale rows are `failed` with the error
   "stale: publication date has passed", and explicitly fail any the
   code missed (separately approved cleanup) or record acceptance of
   the stale sends in the incident record — never re-enable blind.
3b. Review the approved-run queue before re-enabling: list
   `daily_content_recommendations` rows with `status = 'approved'`
   for dates older than today. An approved run for a past date must
   never be consumed after its date passes — the daily edge selects
   the run for TODAY's date only, so a stale approved run is inert,
   but verify it: confirm no publication references an approved run
   whose `kolkata_date` is not its own date, and reject (not delete)
   any stale approved run the owner does not want consumed later.
   `pending_review` rows need no action — they never publish by
   themselves.
4. Re-enable settings (`enabled = true`) — separate approval.
5. Re-enable the two schedules — separate approval (daily first,
   then retry; or both together only if the owner explicitly says
   so).
6. Watch the first publication and delivery per runbook Step 10
   before considering the incident closed.

## What rollback does NOT do

- It does not unsend notifications already delivered.
- It does not delete the migration, the edge function, or the
  endpoint (disabling is reversible; deletion is a separate,
  separately approved decommission decision).
- It does not change any secret, key, or production configuration.
- It does not touch Bilal content, unrelated features, or AdSense.
