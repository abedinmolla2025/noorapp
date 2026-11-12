# Real-Path Dry-Run Acceptance Checklist

Owner-operated procedure. NOT performed in the launch-preparation
mission. Do not run this procedure until runbook Steps 1–4 are
complete (Option C–corrected migration applied, post-migration
verification gate including the 8-privilege matrix passed,
configuration verified, edge function deployed with
`verify_jwt = false`). The dry-run itself must change nothing: it is the last
verification before any enablement decision.

## Procedure

1. Confirm the system is still PAUSED
   (`daily_content_settings.enabled = false` for `id = 1`). A dry-run
   does not depend on the flag (it returns before any gate), but the
   flag must be false so that no scheduled trigger can publish while
   the dry-run is being inspected.
2. Record the current state (read-only): count rows in
   `daily_content_publications` and `daily_content_deliveries`
   (counts only). These counts must be identical after the dry-run.
3. Make ONE authenticated call through the Vercel endpoint with
   `?dry_run=1` (bearer `DAILY_CONTENT_CRON_SECRET`), or the
   equivalent authenticated edge call with body
   `{ "dry_run": true }`. Do NOT add `retry_only=1` (the combination
   is rejected with 400 — if you get 400, you combined the flags;
   retry with dry-run alone).
4. Save the full returned plan (hadith, cards, push payload) for
   inspection. Do not forward it, publish it, or send it to any
   device.
5. Re-count publication and delivery rows (read-only). Confirm both
   counts are unchanged from step 2.
6. Confirm no notification arrived on any subscribed device.
7. Confirm no live setting was enabled (settings row still
   `enabled = false`).

## Acceptance criteria (ALL must pass)

- [ ] At least one eligible Bengali Hadith exists: the plan's hadith
      slot is filled (not an empty reason).
- [ ] Required fields are complete on that record: Arabic text,
      Bengali text, hadith number, book key — all present.
- [ ] Exact Arabic and Bengali text are preserved: the plan's
      hadith text matches the production `hadiths` row
      character-for-character (compare, do not eyeball).
- [ ] Reference and canonical URL are valid: the reference names the
      collection + number, and the canonical link is the book page
      (`/hadith/sahih-bukhari/bangla` form — no guessed per-hadith
      deep link, no invented URL).
- [ ] Three to five shareable cards can be selected: the plan's card
      count is between 3 and 5 inclusive, each from an eligible
      record (Arabic + Bengali + reference + slug).
- [ ] No duplicate card appears in the batch: all card record refs
      are distinct.
- [ ] No invented religious text or references: every Arabic string,
      Bengali string, and reference in the plan traces to a
      production record verbatim; nothing is filled, paraphrased,
      graded, or "completed" by the planner. Any field the record
      lacks makes the record ineligible — it is never synthesized.
- [ ] Dry-run creates no publication or delivery rows: counts from
      steps 2 and 5 are identical.
- [ ] No notification is sent: no device received anything.
- [ ] No live setting is enabled: settings row still
      `enabled = false`.

## Block conditions (any one blocks launch)

- The Hadith slot is empty (no eligible Hadith in the production
  pool), or any required field is missing on the selected record.
- Any text mismatch between the plan and the production record.
- Any invented, paraphrased, or unreferenced religious text in the
  plan.
- Any publication or delivery row created by the dry-run.
- Any notification sent by the dry-run.
- Any live setting changed by the dry-run.
- The dry-run cannot be performed at all (endpoint unreachable, auth
  failing, edge not deployed): launch remains blocked until the
  underlying step (runbook Step 4) is fixed and re-verified.

If the production Hadith pool cannot be verified, launch must remain
blocked. Do not substitute a local fixture, a bundled dataset, or a
different record to "pass" this checklist — the checklist verifies
production, and only production.
