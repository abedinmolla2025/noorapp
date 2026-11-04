# NoorApp Daily Content — Production Launch Readiness Report

Target: commit `1a49613` ("Block stale deliveries + atomic retry claims +
zero-row guards"), branch `muse/daily-content-auto-2026-11-03`.
Audit status at mission start: READY FOR LAUNCH REVIEW (independent final
safety audit of `1a49613`, 2026-11-04).

This report covers the launch-preparation mission only: two hardening
changes, two decided owner policies, a migration/RLS readiness review,
and launch/rollback/dry-run documentation. It authorizes nothing by
itself. Every production step still needs its own owner approval
(see REMAINING-APPROVALS.md).

## 1. Boundaries compliance — what did NOT happen

This mission was preparation and verification only. The following did
NOT occur, and no step below should be read as implying otherwise:

- No production database read or write.
- No migration application or modification.
- No production secret accessed, created, rotated, or modified. No
  secret value appears in this report or any companion document.
- No Supabase Edge Function deployment; no Vercel deployment or
  configuration change.
- No cron registration, activation, or schedule change.
- No Daily Content enablement; the system remains DISABLED.
- No real push notification sent; no publication or content change.
- No GitHub push, merge, or branch modification beyond local commits
  on the feature branch (see §2).
- No AdSense action. No change to Bilal content or any unrelated
  NoorApp feature. No religious text, citation, or content changed.

Local work only: code and test changes in the worktree, local test
runs, and the documents in this folder.

## 2. Commit record

- Starting commit: `1a49613ac410b24c8e578839cfdcbe62c3d7af06`
  ("Block stale deliveries + atomic retry claims + zero-row guards").
- Branch: `muse/daily-content-auto-2026-11-03` (local only, never pushed).
- Baseline state verified before work: HEAD = `1a49613`, branch as
  above, working tree clean (only the pre-existing, untouched
  `scripts/daily-content/preview/out/` artifacts and symlinked
  `node_modules` outside version control).
- Files changed by this mission (no other files touched):
  - `supabase/functions/daily-content/index.ts` — hardening A + B,
    both decided policies, comment updates.
  - `api/daily-content-run.ts` — reject retry_only + dry_run (400).
  - `scripts/daily-content/edge-tests.mjs` — 2 rewritten policy
    tests, 4 new hardening tests, fake fault flag, mutable env stub.
  - `scripts/daily-content/tests.mjs` — 1 new endpoint rejection test.
  - `docs/daily-content/DAILY-CONTENT-LAUNCH-READINESS-REPORT.md`
    (this file), `DAILY-CONTENT-LAUNCH-RUNBOOK.md`,
    `DAILY-CONTENT-ROLLBACK-PLAN.md`, `CHECKLIST-MIGRATION-RLS.md`,
    `CHECKLIST-CONFIG.md`, `CHECKLIST-DRY-RUN.md`,
    `REMAINING-APPROVALS.md`.
- Ending (change) commit: recorded in the delivery message and in
  MEMORY.md at delivery time; it is the commit on
  `muse/daily-content-auto-2026-11-03` containing exactly the files
  above. (A commit hash cannot be written into a file before the
  commit that contains it exists; the delivery record, not this line,
  is the authoritative source for the tip hash.)
- The migration file `supabase/migrations/202611030001_daily_content.sql`
  was inspected read-only and NOT modified, per the brief.

## 3. Baseline verification (before any change)

- HEAD confirmed `1a49613`, branch
  `muse/daily-content-auto-2026-11-03`, tree clean — so the audit of
  `1a49613` applies to exactly the code prepared here. No unreviewed
  change was silently included: the only pre-existing dirt was the
  untouched preview output and the node_modules symlink.
- Baseline suite (from `1a49613`, before changes):
  `bash scripts/daily-content/run.sh` → exit 0, ALL 55 unit tests
  passed, 40 edge tests passed, DRY-RUN OK. TypeScript: 0 errors.
  ESLint: clean on the repo-linted files.

## 4. Hardening A — sent-row resurrection prevented

Problem (from the `1a49613` audit): if a sent-update committed but its
acknowledgement was lost (timeout), the catch handler's patch update
matched the now-`sent` row by id alone and overwrote it back to
`retryable`/`failed`, causing a duplicate send on the next tick.

Fix — every catch-path delivery patch is now conditional on the
expected pre-send state:

- `supabase/functions/daily-content/index.ts:553` (first send):
  catch patch adds `.eq("status", "pending")`. The row is `pending`
  until the sent-update runs, so a genuinely failed send still patches
  normally, while a committed `sent` row matches zero rows and stays
  sent.
- `supabase/functions/daily-content/index.ts:638,640,647` (retries):
  all three catch patches (disabled → failed, cap reached → failed,
  backoff → retryable) add `.eq("status", "retryable")`. Same logic:
  a claimed row is still `retryable` unless its sent-update committed.
- The atomic claim is untouched (same conditional UPDATE, same lease).
- Non-catch patches were deliberately left alone: the non-2xx branch
  patch runs before any sent-update exists for that token, so no
  resurrection path exists there; token-disable updates are independent
  of delivery-row state and only run when the error carries a disabling
  status code (i.e. the send failed, so no sent-update ran).

Regression tests (edge-tests.mjs, via a new fake fault flag
`commitThenThrowSentUpdate` that applies the sent patch and then
throws, modelling commit-then-lost-ack exactly):

- "first-send sent update commits but ack is lost — row stays sent,
  no re-send": row stays `sent`, one provider call, a later tick
  sends zero more times.
- "retry sent update commits but ack is lost — row stays sent, next
  tick does not re-send": same, on the retry path.
- Ordinary retryable failures still follow backoff, and 410 still
  disables the token: covered by the unchanged M2 tests (see §8);
  they pass with the conditional patches in place.

Residual honesty: when the ack is lost after a committed sent-update,
the worker counts the delivery as `failed` (its knowledge) while the
row correctly stays `sent` (reality). Counts may therefore under-claim
success in this rare case; they never over-claim it, and no duplicate
is sent.

## 5. Hardening B — explicit push timeout

Problem (from the `1a49613` audit): push calls carried no timeout, so
a hung provider could hold a claimed row past its 10-minute lease and
invite a second worker to send the same delivery.

Fix — `supabase/functions/daily-content/index.ts:94-112`:

- `PUSH_TIMEOUT_MS_DEFAULT = 30_000` (30 seconds — comfortably below
  the 10-minute lease, generous for push providers that normally
  answer in seconds). Overridable per deployment via
  `DAILY_CONTENT_PUSH_TIMEOUT_MS` (milliseconds); production leaves
  it unset and gets 30 s. No migration, no new column, no production
  configuration change is required.
- `sendPushWithTimeout()` wraps every provider call in a
  `Promise.race` against the timeout and is used at both call sites
  (`:509` first send, `:620` retry). No silent retry inside the call:
  on timeout the single attempt ends and the error propagates to the
  existing catch path.
- Classification preserved: a timeout error carries no status code,
  so `extractPushStatus` returns null and the failure is `retryable`
  with normal backoff. Tokens are never disabled on timeout.
- Late completion: the underlying request may still complete after
  the timeout (provider accepted). That late completion is unawaited
  and touches no database state, so it can neither resurrect nor
  overwrite a terminal row. Its only effect is the documented
  at-least-once re-send on the next tick (the provider accepted once;
  the retry sends again).

Tests (edge-tests.mjs; the Deno env stub gained a per-test override
map so tests can set a 25 ms timeout without touching production
defaults):

- "push timeout is retryable and never disables the token": provider
  never responds → row `retryable` with a future `next_attempt_at`,
  token still enabled, exactly one provider call.
- "late provider completion after timeout cannot change the row;
  next tick re-sends once (at-least-once)": provider accepts 100 ms
  after a 25 ms timeout → row stays `retryable` after the late
  acceptance lands; a later tick (after the backoff elapses) sends
  exactly once more and the row ends `sent`. This test documents the
  residual limitation in executable form: two sends for one delivery
  in the late-acceptance case.

## 6. Decided owner policies (previously open, now implemented)

### 6a. Pause stops retry ticks

- Edge handler (`index.ts:743-749`): the retry branch now reads the
  settings row and returns `{ ok: false, reason: "paused" }` when
  settings are missing or `enabled !== true`, exactly like the daily
  branch. A paused system therefore performs no promotion, no
  supersede, and no retry send. `runTick` itself still does not read
  settings — the gate lives in the handler before `runTick` is reached
  (header and `runTick` comments updated to say so).
- Dry-run is unaffected: it returns before any gate and remains
  read-only (plans, writes nothing, sends nothing).
- Edge test "pause stops retry ticks (no promotion, no retry, no
  send)": missing settings + retry tick → `paused`, zero provider
  calls, retryable row stays `retryable`, pending row stays `pending`,
  past planned row stays `planned` (not superseded while paused).
- This replaces the old test that pinned "ticks proceed while paused".

### 6b. retry_only + dry_run is rejected

- Endpoint (`api/daily-content-run.ts:56-60`): combined flags return
  HTTP 400 with a clear error before any fetch, so the edge function
  is never contacted and the combination performs no planning,
  publication, or sending.
- Edge (`index.ts:734-737`): same rejection (400) as defense-in-depth
  for direct callers, before any planning or retry work.
- Tests: endpoint test "rejects retry_only=1 combined with dry_run=1
  without calling the edge" (400, fetch stub not called); edge test
  "retry_only + dry_run is rejected and performs nothing" (400, zero
  provider calls, row unchanged, no new publication row).
- This replaces the old test that pinned "retry wins".

## 7. Final regression suite — actual commands and results

All run in `~/workspace/noorapp-dailyauto` after all changes:

- `bash scripts/daily-content/run.sh` → exit 0. **ALL 56 unit tests
  passed** (55 baseline + 1 new endpoint rejection test). **44 edge
  tests passed** (40 baseline + 2 rewritten policy tests + 4 new
  hardening tests, counted within the 44; the 2 rewritten tests
  replace, not add to, the old policy tests). **DRY-RUN OK.**
- `./node_modules/.bin/tsc --noEmit` → exit 0, 0 errors.
- ESLint on the repo-linted changed files
  (`api/daily-content-run.ts`, `scripts/daily-content/edge-tests.mjs`,
  `scripts/daily-content/tests.mjs`) → clean.
- ESLint on `supabase/functions/daily-content/index.ts` reports 2
  findings at line 159 (emoji regex character class). These are
  PRE-EXISTING (the line is untouched by this mission — verified via
  the diff hunks), the edge file is Deno code outside the repo's
  normal lint scope, and fixing the regex is out of scope for this
  mission. Recorded here, not hidden, not fixed.
- `scripts/daily-content/dry-run-report.json` is rewritten by every
  `run.sh` invocation; it was restored with `git checkout --` before
  committing, so the committed tree contains no run.sh side effects.
  (The local dry-run fixture is synthetic; the production dry-run in
  CHECKLIST-DRY-RUN.md is a separate, owner-operated step.)

## 8. H1–H3 and M1–M3 verdicts (after hardening)

Re-verified against the changed code; the `1a49613` audit's verdicts
stand, with the two hardening items now closed:

- **H1 stale-send safety: PASS.** Supersede closes pending + retryable
  in one statement; the parent-status check closes stragglers
  terminally; the post-claim re-check narrows the residual race to
  re-check → provider call (microseconds, unclosable without
  provider-side idempotency).
- **H2 concurrent-send safety: PASS.** The atomic claim is unchanged
  and still the only concurrency mechanism (no migration, no RPC, no
  process-local single-flight). Hardening B bounds the lease-expiry
  path with a 30 s provider timeout; hardening A removes the
  timeout-resurrection path for committed sent rows.
- **H3 zero-row/error handling: PASS.** Sent updates, publication
  flips, repairs, and promotions all require matched rows or
  re-resolve; counters never claim uncommitted transitions (except
  the honest under-claim noted in §4).
- **M1 fail-closed settings: PASS**, now including the retry branch:
  missing, disabled, or malformed settings pause everything; dry-run
  stays read-only and ungated.
- **M2 push status classification: PASS.** Structured status-code
  handling (410/404/401/403 disable; 429/5xx retryable; missing code
  and digit-bearing messages never disable); timeout is retryable
  and never disables.
- **M3 NULL/empty device guard: PASS.** NULL/empty/whitespace
  device_ids are skipped and counted at first send; token_id is the
  retry identity. Legacy NULL-device retryable rows can still send
  via the token lookup (pre-existing, bounded, documented in §11).

## 9. Atomic claim and lease analysis (current code)

- Claim: one conditional UPDATE (`id` + `status='retryable'` +
  `attempts<4` + `next_attempt_at <= claimIso`), `.select("id")`,
  send only on exactly one returned row. Postgres row-lock
  serialization + predicate re-evaluation guarantees one claimant;
  the local fake models the protocol, not the locking (documented in
  the `1a49613` audit and unchanged here).
- Lease: fixed 10 minutes from claim, never renewed. Hardening B
  makes the lease safer in practice: provider calls now end after
  30 s at the latest, so a claimed row cannot be held past its lease
  by a hung provider. What the timeout does NOT bound: the edge
  function's own platform execution limit, and a worker that crashes
  between provider acceptance and the sent-update (the at-least-once
  window, §10). The lease duration itself remains a chosen constant,
  not a value derived from a measured platform limit — recorded
  honestly, not assumed sufficient for every pathological case.

## 10. At-least-once delivery limitations (complete, honest list)

The system guarantees at-most-one-planned-publication and
at-most-one-delivery-row per device per day, but delivery itself is
at-least-once in these bounded cases. None produces systematic
duplicates; each produces at most one extra send per affected device:

1. Crash after provider acceptance but before the sent-update: the
   retry tick re-sends once. (Inherent: no transaction spans the
   provider and the database.)
2. Publication becomes failed/superseded between the post-claim
   parent re-check and the provider call: one stale send is possible
   in a microsecond-scale window.
3. Provider accepts late, after the 30 s timeout fired: the row is
   `retryable`, and the next tick re-sends once (proven by test, §5).
4. Sent-update acknowledgement lost after commit: the ROW is now
   protected (hardening A — it stays `sent`, no re-send), but the
   run's counters record the delivery as `failed` rather than `sent`.

Disabled-token rows in `runRetries` are skipped but stay `retryable`
forever (re-read each tick, never sent) — pre-existing, unchanged,
harmless but untidy; a future cleanup may fail them explicitly.

## 11. Migration and RLS findings

Full checklist: CHECKLIST-MIGRATION-RLS.md. Summary by bucket:

**Confirmed from repository** (read from
`supabase/migrations/202611030001_daily_content.sql` and related
migrations):

- Four tables, RLS enabled on all four, status CHECK constraints,
  UNIQUE `kolkata_date` (one publication per day), UNIQUE
  (`publication_id`, `device_id`) (one delivery per device per day),
  FKs with `ON DELETE CASCADE` (publication) and `ON DELETE SET NULL`
  (token).
- Public access: SELECT on publications with `status='published'`
  only. No public write policy on any table. Service-role policies
  exist for all four tables. Seed row `settings (1, false)` — the
  system starts PAUSED.
- `device_push_tokens` compatibility confirmed from
  `20260212...sql`: UUID PK `id`, `device_id TEXT NOT NULL`,
  `token TEXT NOT NULL`, `platform` default `'web'`,
  `enabled BOOLEAN` default true, UNIQUE (`device_id`, `platform`) —
  every column the edge reads exists with a compatible type.
- Preferences client-write limitation confirmed: the migration
  intentionally opens no client write path (admin read + service
  write only); its own comment marks the user toggle as a launch
  follow-up. Consequence: no user-facing daily-toggle UI can write
  preferences yet; opt-outs must be recorded via service-role paths
  (edge/admin) until that follow-up lands.

**Requires production verification** (cannot be confirmed locally):

- Whether `public.admin_users` exists in production. NO repo
  migration creates it (it is only referenced — by the scheduler
  migration and by this one). If absent, admin policies fail closed
  (no admin reads); if it was created out-of-band, admin reads work.
  Verify before relying on admin-page reads.
- Whether production `device_push_tokens` matches the repo schema
  (in particular the `device_id NOT NULL` form from the 20260212
  migration vs. the earlier migration's NULL-tolerant check).
- Whether the four tables are absent (fresh apply) or partially
  present (the migration is `IF NOT EXISTS`-guarded and re-runnable,
  but a partial prior apply must be inspected, not assumed).

**Requires an owner decision:**

- If `admin_users` is absent in production: create it out-of-band,
  or add a migration creating it — the owner decides; this mission
  does not create it.
- Preferences toggle: ship launch without a user-facing toggle, or
  approve the follow-up policy + UI work — the owner decides.
- `deliveries.device_id` stays nullable in the migration (unchanged,
  per the brief). NULL rows bypass the UNIQUE cap by Postgres
  semantics; the edge now never creates them (M3 skip) and never
  sends them on the first-send path, but legacy NULL-device retryable
  rows could still send via the token lookup. Accept, or approve a
  follow-up migration tightening the column — the owner decides.
  (No migration change was made here.)

## 12. Admin and preferences limitations

- Admin reads depend on `public.admin_users` (§11) — unverified in
  production. Admin writes go through service-role only; there is no
  admin client-write policy for settings, so enabling/pausing from
  the admin UI is not possible until a policy or service path is
  approved. Launch enable/pause is therefore an owner dashboard/SQL
  action (see runbook), not an admin-UI click.
- The admin page (`/admin/daily-content`) is a local preview: it
  never publishes or sends. It is not a launch verification tool for
  production state.
- The user daily-toggle UI was not built (launch follow-up). Users
  cannot currently opt out of daily pushes specifically; they can
  only disable push entirely (existing subscription controls). The
  edge honours `daily_content_preferences.daily_enabled = false`
  when such rows exist.

## 13. Remaining production-only verification

Everything in this section is unperformed and blocks launch until
done (see §14 and REMAINING-APPROVALS.md):

1. Migration applied (after approval) and schema verified in
   production (tables, constraints, RLS, policies, seed row paused).
2. `admin_users` existence verified (or the owner decision in §11
   executed).
3. Configuration presence verified without revealing values
   (CHECKLIST-CONFIG.md): `DAILY_CONTENT_CRON_SECRET` (Vercel +
   edge, same value), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   existing VAPID pair consistency. The VAPID pair must NOT be
   regenerated (a new pair invalidates every existing browser
   subscription).
4. Real-path dry-run executed by the owner and accepted against
   CHECKLIST-DRY-RUN.md — including at least one eligible Bengali
   Hadith with complete fields and verbatim text. If the production
   Hadith pool cannot be verified, launch remains blocked.
5. Edge function deployed (after approval); endpoint reachability
   and auth verified (401 without the secret, plan with dry-run).
6. First publication and delivery verified; Android Chrome push
   behavior verified; failed jobs, retries, duplicates, and
   publication status monitored.

## 14. Final verdict

**BLOCKED — PRODUCTION VERIFICATION REQUIRED**

The three states are different, and they must not be conflated:

- **Engineering: COMPLETE.** The two hardening changes and both
  decided policies are implemented locally, with regression tests,
  and the full suite passes (56 unit + 44 edge, TypeScript clean,
  ESLint clean on repo-linted files). H1–H3 and M1–M3 are PASS.
- **Production verification: NOT COMPLETE.** Nothing in §13 has been
  performed. No migration, no deployment, no configuration check, no
  real-path dry-run, no eligible-Hadith confirmation.
- **Owner approval: NOT GRANTED.** No launch step has been approved.
  This report is a preparation package, not an approval.

Passing local tests alone does not authorize launch. The next step
is the owner's: work through REMAINING-APPROVALS.md one approval at
a time, starting with the migration/schema review and the
`admin_users` decision, then the real-path dry-run. Until those are
complete, Daily Content stays disabled, unmigrated, undeployed, and
unsent — exactly as it is now.
