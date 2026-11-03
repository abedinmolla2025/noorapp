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
| Share card UI | `src/components/dailyContent/IslamicContentShareCard.tsx` | Square card, DailyHadith branding. Export via existing `useDomToPng` (html-to-image). |
| DailyHadith feed | `src/components/DailyHadith.tsx` | Optional `published` prop. Absent = original 7-item rotation, byte-identical behaviour. |
| Admin page | `src/pages/admin/AdminDailyContent.tsx` | Route `/admin/daily-content`, sidebar "Daily Content". Enable/pause flag, next run, hadith preview, card previews, push preview, local history, failed jobs + retry. Local-preview banner; never publishes/sends. |
| Cron trigger | `api/daily-content-run.ts` | Forwards to the edge function; relays status only. NO cron registered yet. |
| Edge function | `supabase/functions/daily-content/index.ts` | Full prod logic (plan → publish → web-push → deliveries → retries). NOT deployed. |
| Migration | `supabase/migrations/202611030001_daily_content.sql` | 4 tables + RLS + admin policies. NOT applied. |
| Tests + dry-run | `scripts/daily-content/` | `npm run daily-content:verify`. 31 tests + 4-day dry-run. |

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
  15-minute schedule, OR rely on the next daily tick (retries then run late).
  Recommended: 15-minute retry tick, same secret.

## 4. Database migration requirements

File: `supabase/migrations/202611030001_daily_content.sql` (review only).
- `daily_content_settings` (single row, starts `enabled = false`).
- `daily_content_publications` (one row per Kolkata date, UNIQUE date).
- `daily_content_deliveries` (UNIQUE(publication_id, device_id) = the
  one-per-device-per-day cap, enforced by the database).
- `daily_content_preferences` (per-device daily opt-out; absent = follows
  the general push subscription).
- RLS enabled; admin read via the `admin_users` email check (same as the
  scheduler tables); writes via service role only. No client write path is
  opened in this migration.

Pre-apply checklist (owner/DBA, read-only first):
1. Confirm `admin_users` table exists (the policies reference it).
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
  launch follow-up — see §7).
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
   a client write path (edge-function endpoint or RLS policy) — launch
   follow-up, not a blocker for the first run.
6. **Head-meta live observation is unavailable** (browser tool cannot
   expose `<head>`), so admin previews render in-app only. Previews are
   component renders, not crawler HTML.
7. **No scholar review step.** Eligibility is completeness + source
   fields, NOT an authenticity verdict. No grade is ever shown. If the
   owner wants graded selection, that is a separate workflow.

## 7. Exact steps for a separately approved production launch

In order. Stop at any failed step and report it; do not skip ahead.

1. **Approve + apply the migration** (§4) in the Supabase SQL editor.
   Verify 4 tables + seed row `enabled = false`.
2. **Set the secrets** (§3): `DAILY_CONTENT_CRON_SECRET` (new random value)
   in Vercel AND in the `daily-content` edge function secrets. Confirm the
   VAPID pair matches the existing `scheduler-dispatch` pair (compare
   public keys only, never print private keys).
3. **Deploy the edge function** `daily-content` (Supabase CLI/dashboard).
   Do NOT deploy the Vercel endpoint change yet — actually the endpoint
   ships with the next app deploy; if the app is not being deployed for
   other reasons, the pg_cron alternative in §3 avoids an app deploy.
4. **Dry-run through the real path**: call the edge function with the cron
   secret and `{ "dry_run": true }`. Verify: ≥1 eligible hadith, 3–5
   cards, push payload with a real deep link, no writes, no sends.
   If hadiths = 0 or duas = 0, STOP — resolve §6 items 2–3 first.
5. **Enable**: set `daily_content_settings.enabled = true` (SQL or admin).
6. **Register ONE cron trigger** (§3) for 06:00 Asia/Kolkata + the
   15-minute retry tick.
7. **First live run watch**: after the first 06:00 run, check
   `daily_content_publications` (1 row, status published, counts) and
   `daily_content_deliveries` (sent/failed/retryable). Confirm the homepage
   Daily Hadith card shows the published record: the launch deploy swaps
   `<DailyHadith />` for `<DailyHadithContainer />` in `Index.tsx` (two
   places: the `daily_hadith` section entry and the fallback render).
   The container falls back to the rotation whenever there is no
   publication, so the homepage never breaks.
8. **Verify on a subscribed Android Chrome device**: one notification,
   correct deep link, tap opens the content. Confirm no second
   notification the same day (cap check).
9. **Keep the old rotation as fallback**: if a day has no publication,
   the card renders the original rotation (unchanged behaviour).
