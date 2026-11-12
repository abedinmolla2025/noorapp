# NoorApp Daily Content Automation — Production Readiness

Branch: `muse/daily-content-auto-2026-11-03` (local only, NOT pushed).
Status: implemented + tested locally. NOTHING below has been applied to
production. Every item in §6 needs its own separate owner approval.

## 1. What was built (local)

| Piece | File | Notes |
|---|---|---|
| Eligibility rules | `src/lib/dailyContent/eligibility.ts` | Hadith: Arabic + Bengali + number + book key. Content: Arabic + Bengali + reference + slug. Missing field = ineligible, never filled. |
| Kolkata dates + selection | `src/lib/dailyContent/selection.ts` | 06:00 IST = 00:30 UTC. Deterministic seeded shuffle, no-repeat until pool exhausted, then cycle++. |
| Card payloads | `src/lib/dailyContent/cards.ts` | Verbatim fields only. No virtue/benefit/grade wording. Hadith link = book page (no guessed deep URL). |
| Push payloads + retry | `src/lib/dailyContent/push.ts`, `delivery.ts` | Same 60/120 clamps as scheduler-dispatch. Dead tokens disabled; 429/5xx retryable; max 4 attempts, 5/15/45 min backoff. |
| Day planner | `src/lib/dailyContent/plan.ts` | Pure function: 1 hadith + 3–5 cards + push. Empty hadith slot reports a reason, never invents. |
| Share card UI | `src/components/dailyContent/OgShareCard.tsx` + `ExportableOgShareCard.tsx` | OG-poster system (§8): Dua OG visual language, no fixed theme count, subject-matched text-free backgrounds, programmatic verbatim text overlay. The old `IslamicContentShareCard.tsx` file is untouched on disk. |
| DailyHadith feed | `src/components/DailyHadith.tsx` | Optional `published` prop. Absent = original 7-item rotation, byte-identical behaviour. |
| Admin page | `src/pages/admin/AdminDailyContent.tsx` | Route `/admin/daily-content`, sidebar "Daily Content". Enable/pause flag (LOCAL flag only — production enable/pause is dashboard/SQL), next run (computed, not a registered schedule), hadith preview, card previews, push preview, local history, failed jobs + retry (local rows only). Local-preview banner; never publishes/sends. No user-facing daily toggle UI (see §6 item 5). |
| Cron trigger | `api/daily-content-run.ts` | Forwards to the edge function; relays status only. NO cron registered yet. |
| Edge function | `supabase/functions/daily-content/index.ts` | Full prod logic (plan → publish → web-push → deliveries → retries). NOT deployed. |
| Migration | `supabase/migrations/202611030001_daily_content.sql` | 4 tables + RLS + admin policies. NOT applied. |
| Tests + dry-run | `scripts/daily-content/` | `bash scripts/daily-content/run.sh`. 56 unit + 44 edge tests + 4-day dry-run + TypeScript clean (verified 2026-11-04 for HEAD `022fa31`). Local dry-run hadith pool is empty (synthetic fixture) — see §6 item 2. |

## 2. What was REUSED (not rebuilt)

- Web Push: `public/sw.js` push/notificationclick handlers, `useWebPushRegistration`
  (VAPID subscribe, opt-in gated), `webpush-public-key` edge function,
  `device_push_tokens`, `notification_deliveries` logging, dead-token disabling.
- Scheduler patterns: `scheduler-dispatch` copy/clamp/delivery code,
  `scheduler-tick` heartbeat shape, `AdminSchedulers` enable/next-run UX.
- Share pattern: `NameShareSquare` + `useDomToPng` (html-to-image export).
- DailyHadith card UI and branding (emerald gradient, gold accents).

## 3. Required production configuration (names only, NO values)

Vercel (project `noorappold`, existing vars untouched):
- `DAILY_CONTENT_CRON_SECRET` — NEW. Random secret, shared by the Vercel
  endpoint and the edge function (same value both sides).
- `SUPABASE_URL` — already present on the project; the endpoint reuses it.

Supabase Edge Function secrets (`daily-content` function):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — standard, already used by
  `scheduler-dispatch`.
- Deployment setting (not a secret): `verify_jwt = false` for
  `daily-content` (config.toml entry or `--verify-jwt=false` flag) —
  the handler authenticates with the Bearer cron secret, not a JWT;
  without this, gateway JWT verification rejects cron calls. See
  runbook Step 4.
- `WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_VAPID_PRIVATE_KEY` — SAME pair as
  `scheduler-dispatch` / `webpush-public-key`. Do NOT generate a new pair:
  a new pair invalidates every existing browser subscription.
- `DAILY_CONTENT_CRON_SECRET` — same value as the Vercel var above.

Cron (register ONLY after launch approval):
- Vercel Cron on `api/daily-content-run`: `30 0 * * *` (00:30 UTC =
  06:00 Asia/Kolkata, IST has no DST). Alternative: Supabase pg_cron calling
  the edge function directly every day at 00:30 UTC — pick ONE trigger, never
  both (double trigger is harmless due to the published-date idempotency,
  but one is cleaner).
- Retry processing: same endpoint with body `{ "retry_only": true }` on a
  15-minute schedule, same secret (runbook Step 9). The retry tick is
  part of the launch procedure, not optional.

## 4. Database migration requirements

File: `supabase/migrations/202611030001_daily_content.sql` (review only).
- `daily_content_settings` (single row, starts `enabled = false`).
- `daily_content_publications` (one row per Kolkata date, UNIQUE date).
- `daily_content_deliveries` (UNIQUE(publication_id, device_id) = the
  one-per-device-per-day cap, enforced by the database).
- `daily_content_preferences` (per-device daily opt-out; absent = follows
  the general push subscription).
- RLS enabled; admin policies use `public.is_admin(auth.uid())`
  (Option C correction; corrected file md5
  `7dd7f00aaab4cb668c72e4cf8bbed062`); writes via service role
  only. No client write path is opened in this migration. No
  email-list admin table is required.
- Post-apply gate: after applying, complete the 8-privilege matrix
  gate (CHECKLIST-MIGRATION-RLS.md §G) before proceeding; any
  narrowing (including REVOKE) needs its own separate approval.

Pre-apply checklist (owner/DBA, read-only first):
1. Confirm the migration file is the Option C–corrected version
   (md5 above) and that its correction is owner-approved; confirm
   `public.is_admin(uuid)` exists and `user_roles` has an
   admin/super_admin row.
2. Confirm `device_push_tokens` has `device_id` populated for web rows
   (the cap key and opt-out join on it).
3. Apply in the Supabase SQL editor; verify the 4 tables + seed row
   (`enabled = false`).

## 5. Push subscription setup instructions (for users)

No action is needed from existing subscribers: the current VAPID key pair
is reused, so existing browser subscriptions keep working.
- New subscriber flow (already in the app, unchanged): the notification
  opt-in prompt → user taps Enable → browser permission dialog → Allow →
  the app registers `/sw.js` and stores the subscription in
  `device_push_tokens` (platform `web`, `enabled = true`).
- Unsubscribe: browser site settings → Notifications → Block for
  noorapp.in, OR the in-app prompt's dismiss path; the app also
  unsubscribes the PushManager subscription. Disabled/dead tokens
  (404/410) are auto-disabled server-side.
- Daily-only opt-out: `daily_content_preferences.daily_enabled = false`
  for the device (admin/edge-function path; client toggle UI is a
  launch follow-up — see §6 item 5).
- Android Chrome: Web Push is supported (service worker + PushManager).
  The notification uses remote icon/badge URLs and an optional image,
  which Android Chrome renders. No `actions` buttons are used (compat).
  Chrome on iOS does NOT support Web Push — out of scope (web only).

## 6. What is NOT done / NOT approved (blockers)

1. **No production changes at all**: no DB writes, no migration applied, no
   settings changed, no merge, no push, no deploy, no live cron, no live
   publish, no real notification sent. Each needs its own message.
2. **Local hadith pool is empty — expected, not a bug.** There is no
   bundled Bengali hadith dataset in the repo (only EN/UR JSON), and local
   tooling never reads the live DB. The dry-run therefore shows an empty
   hadith slot with an explicit reason. The production pool is the
   `hadiths` table (Arabic + Bengali + number + book key). Before any
   live publish, the edge-function dry-run MUST show ≥1 eligible hadith.
3. **Dua reference mapping is assumed, not verified.** The edge function
   reads the dua reference from `admin_content.metadata.reference`
   (fallback `metadata.source`). If the launch dry-run shows 0 eligible
   duas, the mapping is wrong and must be fixed from real row data —
   never by inventing references.
4. **Hadith deep links are book pages, not per-hadith pages.** The
   `hadiths` table has no slug, and the chapter-slug mapping is not in
   the table. Cards/pushes link to `/hadith/sahih-bukhari/bangla` with
   chapter + number in the source line. Per-hadith deep links need a
   chapter-slug mapping (future work, not a launch blocker).
5. **Daily-content toggle UI for users is not built.** Unsubscribe works
   via the existing push unsubscribe; the per-device daily toggle needs
   the edge-mediated write path (Option B design in
   REMAINING-APPROVALS.md — a direct client RLS policy on
   `daily_content_preferences` is rejected because `device_id` is
   self-asserted) — launch follow-up, not a blocker for the first run.
6. **Head-meta live observation is unavailable** (browser tool cannot
   expose `<head>`), so admin previews render in-app only. Previews are
   component renders, not crawler HTML.
7. **No scholar review step.** Eligibility is completeness + source
   fields, NOT an authenticity verdict. No grade is ever shown. If the
   owner wants graded selection, that is a separate workflow.
8. **Background catalog now covers a full batch.** The catalog holds 7
   text-free backgrounds (guidance path, mountain sunrise, rain leaf,
   morning bedroom window, home entrance, night lantern, mosque
   courtyard); a 3–5 card batch gets a distinct scene per card with
   spares left, and the QC gate still flags any earlier repeat as an
   error. Further subjects keep joining the same unbounded catalog.
9. **Option C migration correction and launch documentation refresh
   are implemented locally and await owner review.** The corrected
   migration (is_admin policies) and the refreshed launch documents
   (runbook, approvals, migration checklist, config checklist,
   dry-run checklist, rollback plan, this document) are local
   changes only — none is applied, deployed, or live until its own
   approval.
10. **At-least-once residuals R-5/R-6 + retry opt-out N-1
    (2026-11-04 mission; full text in the mission report).**
    R-5 (daily-vs-tick double-send window) is FIXED LOCALLY in
    this mission: first-send claim (10-minute `next_attempt_at`
    lease) + promotion guards, covered by a daily-vs-tick overlap
    edge test; the fix itself awaits owner review (approvals
    item 12) and is not deployed. N-1 (retry path ignored
    opt-outs) is FIXED LOCALLY in this mission: runRetries now
    reads `daily_content_preferences` and closes opted-out rows
    terminally, covered by a retry opt-out edge test; same review
    status. R-6 (stale retryables from old publications send on
    re-enable after a long pause, because runRetries is
    date-agnostic) is NOT code-fixed: it is mitigated by
    rollback-plan re-enable step 3 (review + explicitly fail
    stale retryables before re-enabling). The remaining
    at-least-once windows (crash after provider acceptance,
    late acceptance after a timeout, microsecond re-check window)
    are unchanged documented residuals; explicit acceptance is
    approvals item 13.
11. **Focused re-audit round (2026-11-04): strand defect found
    and fixed locally.** The re-audit confirmed the R-5 claim and
    the N-1 fix but found a LOW defect the claim introduced:
    crash + daily resume within the 10-minute lease stranded a
    pending row behind a `published` flip (silent single-device
    miss). Fixed locally in this mission: ticks now promote due
    pending rows of today's published publication (same-day
    content only; past days never revived), covered by two strand
    edge tests. Also fixed locally: NULL-retryable selection +
    claim (latent gap), and a status guard on the retry
    sent-update (in-flight opt-out race: the send itself remains
    unavoidable, but the row is no longer resurrected to sent).
    Remaining accepted residuals: the in-flight opt-out race
    itself; disabled-token + opted-out rows never terminally
    closed (pre-existing, nothing sent); the lease-boundary
    note (push timeout must stay well inside the 10-minute
    lease — see CHECKLIST-CONFIG.md). These latest fixes were
    verified by the full suite (56 unit + 50 edge, tsc 0,
    eslint 0) but have NOT had a third independent audit pass —
    they await owner review under approvals item 12.

    Update 2026-11-04 (post final review): the final independent
    review classified the send-path fixes PASS FOR OWNER REVIEW and
    set three conditions, all remediated locally in this diff
    (uncommitted): `pushTimeoutMs` clamped to 300,000 ms max
    (default 30,000 ms preserved, invalid values fall back to the
    default); `runTick` returns `promotedPublished`; a past-day
    non-revival edge test proves yesterday's published pending rows
    stay pending under today's tick. Suite now 56 unit + 52 edge,
    tsc 0, eslint 0. The midnight-spanning strand residual and the
    R-6 operational mitigation (rollback-plan re-enable step 3) are
    unchanged.

## 8. Share cards: OG-poster system (local, previews only)

The fixed-theme card systems (5-theme, then 8-theme) were set aside
unpushed: they were color variations of one template, which the owner
rejected. The replacement rebuilds the existing Dua OG posters' visual
language as a DOM component, with NO fixed theme count:

- **Component**: `src/components/dailyContent/OgShareCard.tsx` — green
  NOOR APP mark + `noorapp.in`, dark reference pill with gold book icon,
  gold Bengali title, gold divider, dark glass Arabic panel, white
  Bengali translation with gold quote marks. There is NO footer banner:
  no store badges, no download text, no bottom strip (owner direction
  2026-11-03). Branding lives in the header only, and the content stack
  is vertically centered with slightly larger type, so the frame
  rebalances itself with no empty space where a banner used to be.
- **Badge rule** (`badgeLabelForCard`): Quran-sourced → QURANIC DUA,
  hadith-sourced → HADITH, dua from a hadith collection → PROPHETIC DUA,
  otherwise DUA. It restates the record's source, never a new claim.
- **Backgrounds** (`src/lib/dailyContent/backgrounds.ts`): text-free
  photographs generated separately — the image model never writes
  Arabic/Bengali text, and all text is overlaid programmatically from
  the record. Scenes are matched to the card's subject
  (`assignBackgrounds`: subject match first, no repeat inside a batch
  while unused scenes remain, deterministic). The catalog is unbounded
  by design; `FUTURE_SCENE_IDEAS` lists the next subjects, not inventory.
- **Export** (`ExportableOgShareCard.tsx`, existing `useDomToPng`):
  stage 540×675 / 540×540 at pixelRatio 2 = exactly 1080×1350 /
  1080×1080 PNG.
- **QC** (`src/lib/dailyContent/ogQc.ts`): character-exact text equality
  vs the source record, non-empty fields, background uniqueness, and
  long-text warnings (never silent truncation). Contrast is verified
  visually on real previews, not numerically, because the backgrounds
  are photographs (readability comes from the dark scrim + glass panel).
- **Admin**: `/admin/daily-content` now previews OG cards with their
  assigned backgrounds, a QC PASS/FAIL line, and per-card PNG export.
  The old `IslamicContentShareCard` file is untouched on disk.
- **Previews** (regenerable, not committed):
  `scripts/daily-content/preview/build-preview.mjs` → `out/`:
  Quran (guidance, Al-Faatiha 1:6, path-at-dawn), Hadith (intentions,
  Sahih Bukhari with no number — the app's own entry carries none),
  Dua (forgiveness, Al-A'raaf 7:23, rain leaf), plus a square
  forgiveness card. All 4 visually QC'd PASS at exact export sizes.
  Later additions: a Hadith square (1080×1080) and a 390px phone-width
  rendering check of the Hadith card, both QC'd PASS.
- **Existing OG images untouched**: `public/assets/dua-og/` and
  `public/assets/og-images/` are byte-identical (git status clean);
  `DuaDetailPage` og:image metadata and the canvas OG generator are
  not modified. The new backgrounds live separately in
  `public/assets/card-backgrounds/`.

## 7. Exact steps for a separately approved production launch

In order. Stop at any failed step and report it; do not skip ahead.

1. **Approve + apply the migration** (§4) in the Supabase SQL editor
   (only after the Option C correction itself is owner-approved).
   Verify 4 tables + seed row `enabled = false`, then complete the
   8-privilege matrix gate (CHECKLIST-MIGRATION-RLS.md §G).
2. **Set the secrets** (§3): `DAILY_CONTENT_CRON_SECRET` (new random value)
   in Vercel AND in the `daily-content` edge function secrets. Confirm the
   VAPID pair matches the existing `scheduler-dispatch` pair (compare
   public keys only, never print private keys).
3. **Deploy the edge function** `daily-content` (Supabase CLI/dashboard)
   with `verify_jwt = false` specified explicitly (runbook Step 4).
   Do NOT deploy the Vercel endpoint change yet — actually the endpoint
   ships with the next app deploy; if the app is not being deployed for
   other reasons, the pg_cron alternative in §3 avoids an app deploy.
4. **Dry-run through the real path**: call the edge function with the cron
   secret and `{ "dry_run": true }`. Verify: ≥1 eligible hadith, 3–5
   cards, push payload with a real deep link, no writes, no sends.
   If hadiths = 0 or duas = 0, STOP — resolve §6 items 2–3 first.
5. **Enable**: set `daily_content_settings.enabled = true` via the
   owner dashboard/SQL path only (the admin UI cannot write settings).
6. **Register ONE cron trigger** (§3) for 06:00 Asia/Kolkata + the
   15-minute retry tick.
7. **First live run watch**: after the first 06:00 run, check
   `daily_content_publications` (1 row, status published, counts) and
   `daily_content_deliveries` (sent/failed/retryable). The homepage
   Daily Hadith card shows the published record ONLY after the
   separately approved homepage swap (`<DailyHadith />` →
   `<DailyHadithContainer />` in `Index.tsx`, two places: the
   `daily_hadith` section entry and the fallback render) is deployed;
   until then the homepage shows the original rotation. The container
   falls back to the rotation whenever there is no publication, so
   the homepage never breaks.
8. **Verify on a subscribed Android Chrome device**: one notification,
   correct deep link, tap opens the content. Confirm no second
   notification the same day (cap check).
9. **Keep the old rotation as fallback**: if a day has no publication,
   the card renders the original rotation (unchanged behaviour).
