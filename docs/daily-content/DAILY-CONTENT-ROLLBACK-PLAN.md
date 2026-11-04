# NoorApp Daily Content — Rollback Plan

Purpose: stop all Daily Content activity quickly and safely, without
destroying evidence or breaking existing subscriptions. Nothing in
this plan has been executed. Each action is owner-operated.

Trigger: any of — systematic duplicate deliveries, a stale
notification sent, a failed publication two days running, auth or
provider misconfiguration discovered after launch, or any other
production incident attributable to Daily Content. When in doubt,
pause first and investigate second: pausing is reversible and
lossless, while a day's bad sends are not.

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
the homepage card reads today's published row, and deleting it would
break the card and destroy the audit trail. If a published day's
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
3. Re-enable settings (`enabled = true`) — separate approval.
4. Re-enable the two schedules — separate approval (daily first,
   then retry; or both together only if the owner explicitly says
   so).
5. Watch the first publication and delivery per runbook Step 10
   before considering the incident closed.

## What rollback does NOT do

- It does not unsend notifications already delivered.
- It does not delete the migration, the edge function, or the
  endpoint (disabling is reversible; deletion is a separate,
  separately approved decommission decision).
- It does not change any secret, key, or production configuration.
- It does not touch Bilal content, unrelated features, or AdSense.
