# NOORAPP — P0 REMEDIATION REPORT

Date: 2026-09-29 (IST) · generated from local commits only, NOT pushed, NOT deployed.
Audit basis: `research/forensic/NOORAPP-FULL-SITE-AUDIT.md` / `.json` (2026-09-28, final A→Z verdict: NOT READY — P0 BLOCKERS REMAIN).

## Verdict

**P0 REMEDIATION INCOMPLETE — BLOCKERS REMAIN**

Code remediation for all 10 P0s is implemented, tested, and committed locally. However: nothing has been redeployed (live unauthenticated endpoints remain exploitable in production), the exposed Lovable API key has not been rotated, two RLS/DB migrations still require privileged application, scholar-source research is still human-pending, and quiz human decisions are still open. Per the standing rule ("do not claim completion unless those are genuinely resolved with evidence"), completion cannot be claimed.

## Commit inventory (local only, not pushed)

| SHA | P0 | Subject |
|---|---|---|
| `d06340a` | P0-1 | gate AI-pipeline edge functions behind admin auth; move Lovable key to env |
| `884d1ce` | P0-2 | gate scheduler-dispatch and scheduler-tick behind shared secret + admin auth |
| `a702c2c` | P0-6 | verify scholar-intro publication boundary; add regression tests |
| `7255933` | P0-3 | geolocation privacy — precision caps, consent gating, RLS migration prepared |
| `55cfb65` | P0-7/P0-8 | quiz answer-key render safeguards + duplicate canonicalization |
| `02a0068` | P0-5 | close dua virtue leak channels (render-layer) |
| `49aa7f7` | P0-4 | thin/duplicate URL classes — /names 301, chapter-0 404, /hadith/h noindex |
| `62907d5` | P0-9/P0-10 | honest availability claims; story bot/human parity |
| `3554e4c` | P0-5 f/u | suppress uncited benefits/explanation variants (render-layer) |
| `c9a0bbb` | P0-2 f/u | gate send-prayer-notifications behind SCHEDULER_CRON_SECRET |

54 files changed, +3945/−248 across the remediation range. No production mutation of any kind occurred (no DB writes, no scheduler invocations, no pushes sent, no AI enrichment runs, no indexing/AdSense actions, `noorapp-ucmi` untouched).

---

## P0-1 — Unauthenticated AI content-pipeline writes · `d06340a`

- **Root cause:** six AI-writing Edge Functions (`enrich-dua-content`, `fix-dua-content`, `generate-dua-seo`, `generate-hadith-seo`, `generate-quiz-sfx`, `notify-search-engines`) accepted unauthenticated requests and two hardcoded the Lovable API key.
- **Files changed:** new `supabase/functions/_shared/require-admin.ts`; auth tests (`require-admin.test.ts`, `require-admin.test.mjs`); `P0-1-SECRETS-CHECKLIST.md`; all six functions gated.
- **Security changes:** 401 on missing/malformed bearer or invalid/expired/forged JWT (`auth.getClaims`); 403 on valid non-admin or failed `is_admin` RPC; service-role client created only after authorization; Lovable key read from function env and fail-closed if missing; hardcoded historical key removed.
- **DB migrations:** none.
- **Tests:** Node fallback auth tests 8/8 pass; `tsc` 0 errors. (Deno unavailable locally — Deno wiring hand-reviewed; Deno test file ships for CI.)
- **Unresolved:** the historically exposed Lovable key must be rotated by the user in the Lovable dashboard (treat as compromised; value never recorded); the fixed functions are not yet redeployed, so the live vulnerable versions remain until deploy.
- **Deployment readiness:** ready for redeploy once the key is rotated; secret rotation must precede redeploy.
- **Rollback:** revert `d06340a`; redeploy previous function versions.

## P0-2 — Unauthenticated push dispatch · `884d1ce` + `c9a0bbb`

- **Root cause:** `scheduler-dispatch` Edge Function and the Vercel `/api/scheduler-tick` route were unauthenticated; `send-prayer-notifications` was a live unauthenticated mass-push endpoint (service-role key, all enabled preference rows, no auth on the request).
- **Files changed:** new `supabase/functions/scheduler-dispatch/authz.ts` (pure decision logic); `scheduler-dispatch/index.ts` gated; new scheduler auth tests; `api/scheduler-tick.ts` gated; new tick tests; `vercel.json` cron entry (proposal-only, placeholder secret); `research/forensic/P0-2-stale-schedules-migration.sql` (proposal-only); `send-prayer-notifications/index.ts` gated (follow-up); `send-prayer-notifications/gate.test.mjs`.
- **Security changes:** POST-only; cron shared secret (`SCHEDULER_CRON_SECRET`) authorizes bulk/single dispatch; valid admin JWT + `is_admin` authorizes only single `{schedule_id}` preview (admins can never bulk); missing/wrong secret → 401; non-admin → 403; malformed JSON → 400 before dispatch; missing secret config fails closed; secret never logged; `send-prayer-notifications` reuses the same gate with `wantsBulk: true` (admin JWT deliberately insufficient); service-role client created only after the gate.
- **DB migrations:** `P0-2-stale-schedules-migration.sql` prepared but NOT applied — disables stale enabled schedules >7 days old transactionally; legacy pg_cron job proposed for retirement. Needs privileged review/apply.
- **Tests:** scheduler auth 25/25, tick route 14/14, send-prayer-notifications gate 8/8 (incl. structural assertion the gate precedes service-role client creation); all fetches mocked; no push sent; no endpoint invoked.
- **Unresolved:** (1) `vercel.json` crons path contains the placeholder `REPLACE_WITH_SCHEDULER_CRON_SECRET` — must be replaced and the query-string-secret approach reviewed (prefer Vercel's `Authorization: Bearer <CRON_SECRET>` mechanism or a dashboard cron; also `* * * * *` needs a Pro plan). (2) The legitimate scheduler caller (pg_cron) must be configured to send the `Authorization` header — until then the gated functions fail closed and scheduled pushes stop. (3) Stale-schedule migration not yet applied; 6 stale enabled schedules could bulk-fire if dispatch becomes healthy. (4) Nothing redeployed — live endpoints still unauthenticated.
- **Deployment readiness:** NOT ready until the secret is configured in Supabase + `noorappold`, the caller is updated, and the stale-schedule migration decision is made.
- **Rollback:** revert `884d1ce`/`c9a0bbb`; redeploy previous versions.

## P0-3 — Anonymously readable precise geolocation · `7255933`

- **Root cause:** full-precision browser coordinates persisted to `user_notification_preferences`; auto push-location sync without separate consent; anon SELECT policy exposed all `user_id IS NULL` rows with CORS `*`.
- **Files changed:** new `src/lib/notificationPreferences.ts`; `src/lib/location.ts` (validate + round); `PrayerNotificationSettings.tsx`, `usePrayerTimes.ts`, `useWebPushRegistration.ts` (consent-gated sync); manual input step 0.01; upsert replaces SELECT-then-write; `scripts/test-p0-3-geolocation.mjs`; `research/forensic/P0-3-geolocation-rls-migration.sql` (proposal-only).
- **Security changes:** 2-decimal precision cap (~1.1 km grid) enforced at every client egress; invalid/out-of-range/string/`(0,0)` coordinates rejected; auto-sync requires explicit saved-location consent; local cache + external requests use rounded values.
- **DB migrations:** `P0-3-geolocation-rls-migration.sql` prepared but NOT applied — rounds existing stored coordinates, removes all world-readable SELECT policy variants, owner-only authenticated SELECT, dedupe/add unique `device_id`, preserves service-role server access. Needs privileged review/apply (verify live policy set + uniqueness assumptions first).
- **Tests:** 57/57 pass; `tsc` 0 errors; build pass.
- **Unresolved:** existing precise DB rows remain until migration; users without explicitly saved location no longer receive server-side prayer pushes (deliberate fail-closed); adjacent discovery — array-shaped `enabled_prayers` may produce zero prayer notifications (not fixed, out of scope).
- **Deployment readiness:** client changes ready; migration must be applied first or in the same window.
- **Rollback:** revert `7255933`.

## P0-4 — Thin/duplicate indexable URL classes · `49aa7f7`

- **Root cause:** `/names` served a thin 200 app shell (SPA already redirected to `/baby-names`); `chapter-0` bypassed the 404 guard because `Number("0")` is falsy (`if (chapterId && …)`), rendering hub-identical thin content; ~7,220 `/hadith/h/*` single-hadith pages were indexable but orphaned (no sitemap, no internal links).
- **Files changed:** `api/prerender.js` (`/names` → 301 via `CANONICAL_REDIRECTS`, removed from `CLIENT_ONLY_ROUTES`; chapter guard → `chapterId !== null`; `/hadith/h/*` → `noindex,follow`); `BukhariLangPage.tsx` (invalid-chapter incl. chapter-0 → 404 + noindex view); `HadithDetailPage.tsx` (noindex robots meta).
- **Security changes:** none. **DB migrations:** none.
- **Tests:** 26/26 runtime assertions (guard logic, 301s, 404s, noindex, chapter pages still indexable); `tsc` 0 errors; build pass; quality gates unchanged.
- **Unresolved:** live fetch verification still needed post-deploy; optional edge redirect for `/names` (direct no-JS browser hit currently gets the SPA shell before client-side Navigate).
- **Deployment readiness:** ready.
- **Rollback:** revert `49aa7f7`.

## P0-5 — Dua virtue gaps + leak channels · `02a0068` + `3554e4c`

- **Root cause:** 160 templated virtue rows in DB (render-suppressed since 2026-09-27, but rows persist); 6 hardcoded uncited virtue claims on `/tasbih`; 11 rows leaking fazilat promises via `explanation_bn`; uncited promises in `benefits_*` and `explanation_en/hi/ur` variants.
- **Files changed:** `TasbihPage.tsx` (6 claims removed — no verified source existed for any), `public/data/dhikr-list.json` (regenerated), `api/prerender.js` (tasbih render removed; 11-row `explanation_bn` nulling; explanation/benefits variant nulling), `DuaDetailPage.tsx` (`EXPLANATION_BN_SUPPRESSED_SLUGS` + `BENEFITS_SUPPRESSED_SLUGS` decision points), `scripts/p0-5-dua-virtue-leak-sweep.mjs`, `scripts/p0-5-followup-render-assertions.mjs`.
- **Security changes:** none. **DB migrations:** none applied — zero DB writes; privileged cleanup manifest `DUA_CLEANUP_FINAL_2026-09-28.csv` still pending.
- **Tests:** leak sweep 25/25 (SPA↔prerender parity, gating, 25 known-bad texts across 8 render files); runtime assertions 111/111; live prerender end-to-end on 4 suppressed duas clean, control clean dua renders, `/tasbih` clean; `tsc` 0 errors; build pass; quality gates unchanged. Nothing invented, nothing rewritten — uncited claims suppressed, not softened.
- **Unresolved:** (1) privileged dua virtue DB cleanup still RLS-blocked; (2) the 11 `explanation_*` texts remain in DB and need scholar verification + exact citations before any write; (3) benefits classification beyond the 2 flagged rows relied on Batch-5 reads + TRK2-023 spot-check — a full read-only `benefits_*` audit (TRK2-023) still recommended.
- **Deployment readiness:** render-layer ready; DB cleanup awaits privileged access.
- **Rollback:** revert `02a0068`/`3554e4c`.

## P0-6 — Scholar-source intro publication boundary · `a702c2c`

- **Root cause:** risk of unpublished scholar-intro drafts leaking to public surfaces.
- **Files changed:** `scripts/verify-intro-publication-boundary.mjs`; `SCHOLAR-REVIEW-211-STATUS-2026-09-29.csv`.
- **Security changes:** none. **DB migrations:** none.
- **Tests:** 32/32 pass — unpublished == inaccessible across `src/data`, SPA fail-closed, prerender fail-closed, public/dist copies, sitemap, JSON-LD, no draft imports. (Audit's chapter-19 example was stale — chapter 19 is published; negative test uses chapter 78.)
- **Unresolved:** human requirement — 10 class-C surahs + 3 hadith chapters (78, 80, 82) withheld pending genuine scholar review; 81 hadith chapters have no verified intro. No code can invent this.
- **Deployment readiness:** boundary code is test-only; nothing to deploy.
- **Rollback:** revert `a702c2c`.

## P0-7 — Quiz answer-key integrity · `55cfb65`

- **Root cause:** 17 C-records with contradicted answer keys (all 313 rows re-read from DB read-only; stored answer vs options vs explanation vs JSON-LD compared).
- **Files changed:** `src/data/quiz-answer-safeguards.json` (1 evidence-backed correction `9322e182…`: key `২০` contradicted by the row's own explanation, `২৫` verified verse-by-verse and present verbatim at index 1; 10 suppressions); `src/lib/quizAnswerSafeguard.ts` (fail-closed; correction applies only if option text still matches expected text); `QuizDetailPage.tsx`; `api/prerender.js` (mirrored); `extract-tool-data.mjs` (strict validation); `vercel.json` includeFiles extended (string brace form); `P0-7-answer-key-NEEDS-REVIEW.csv`; `P0-8-trio-pairs-HUMAN-DECISION.csv`; `scripts/test-p0-7-p0-8-quiz.mjs`.
- **Security changes:** none. **DB migrations:** none applied — 18-row manifest carries exact privileged DB fixes, RLS-blocked.
- **Tests:** 271/271 pass; `tsc` 0 errors; build pass; live prerender smoke (corrected record asserts `২৫`, suppressed records omit `acceptedAnswer`, unsafeguarded records unchanged); quality gates unchanged. Textual correct answers never altered for canonicalization; stale evidence ⇒ suppress.
- **Unresolved:** all 11 privileged DB fixes pending; textual-correct-answer invariant blocks the Ar-Rahman/Al-Malik trio thirds (human decision required, documented in manifest).
- **Deployment readiness:** render-layer ready; DB fixes await privileged access + human decisions.
- **Rollback:** revert `55cfb65`.

## P0-8 — Indexable duplicate quiz pairs · `55cfb65`

- **Root cause:** exact-duplicate quiz pairs indexed under multiple URLs.
- **Files changed:** same commit as P0-7.
- **Decision:** canonical map deliberately UNCHANGED at 31 mappings after evidence review — the 3 excluded near-duplicate pairs are not exact duplicates (Sadaqatul Fitr wording differs, Hajj-vs-Eid distinct angles, Mikail pair reciprocal distinct); 2 unmapped trio thirds blocked by the correct-answer invariant (human decision); pre-existing `2d8b8a13→878f699d` contradiction escalated in the manifest, not silently mutated.
- **Tests:** 271/271 (canonical-map behavior suite included); quiz-consolidation gate 31/31.
- **Unresolved:** trio-pair human decisions; 3 near-duplicate classifications.
- **Deployment readiness:** ready (no code change to deploy beyond P0-7's).
- **Rollback:** revert `55cfb65`.

## P0-9 — False Hadith availability claims · `62907d5`

- **Root cause:** multiple surfaces promised browsable Sahih Muslim / Abu Dawud / Tirmidhi collections that do not exist.
- **Files changed:** `seoDefaults.ts` (muslim/tirmidhi/abu-dawud → "planned for a future release … not yet available"), `HadithBookPlaceholder.tsx`, `HadithPage.tsx`, `AboutPage.tsx`, `SitemapPage.tsx` (honest labels; Muslim link fixed `/hadith` → `/hadith/muslim`), `IslamicAppPage.tsx`, `SeoIntroSection.tsx` (homepage FAQ); `scripts/regression-p0-9-availability.mjs`. Placeholder pages keep noindex + BreadcrumbList-only JSON-LD.
- **Security changes:** none. **DB migrations:** none.
- **Tests:** 285-file sentence-level scan PASS (8/8 old false claims caught in negative control, 0 false positives on honest copy); `tsc` 0 errors; build pass; quality gates unchanged.
- **Unresolved:** live verification post-deploy.
- **Deployment readiness:** ready.
- **Rollback:** revert `62907d5`.

## P0-10 — Story bot/browser divergence · `62907d5`

- **Root cause:** prerender story branch read the bundled ~90-word summaries first while the SPA served full DB narratives (71/72 pages divergent).
- **Files changed:** `api/prerender.js` (story detail → published-DB-first with `.eq("status","published")` gate; category listing DB-first); `src/lib/stories.ts` (comment); `scripts/regression-p0-10-story-parity.mjs`.
- **Security changes:** none. **DB migrations:** none (read-only select).
- **Tests:** bot HTML now carries full DB narrative — prophet-musa 18,370 chars, prophet-yunus 22,145, prophet-yusuf 22,267 (vs ~5–6k bundled); 200, index,follow, self-canonical, Article JSON-LD headline = DB title; negative control (pre-fix) fails 4 checks; `/stories/test-story-manus` → 410, unknown → 404, drafts never leak. `tsc` 0 errors; build pass; quality gates unchanged.
- **Unresolved:** live verification post-deploy.
- **Deployment readiness:** ready.
- **Rollback:** revert `62907d5`.

---

## Combined validation (final, local)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | PASS |
| `scripts/quality-gates.mjs` | 11/12 pass — 1 failure = pre-existing ch35 duplicate-titles (70-char `<title>` truncation artifact, byte-identical on pristine tree; not a regression) |
| `scripts/verify-hadith-title-consistency.mjs` | 291/291 PASS (selector untouched) |
| `research/forensic/validate_mapping.py` | 21/21 PASS |
| `scripts/verify-phase8.mjs` | ALL PASS |
| P0-1 auth tests | 8/8 |
| P0-2 dispatch gate | 25/25 |
| P0-2 tick gate | 14/14 |
| P0-2 send-prayer-notifications gate | 8/8 |
| P0-3 geolocation | 57/57 |
| P0-6 intro boundary | 32/32 |
| P0-7/P0-8 quiz | 271/271 |
| P0-5 leak sweep | 25/25 |
| P0-5 follow-up runtime assertions | 111/111 |
| P0-9 availability regression | PASS (285 files) |
| P0-10 story parity | PASS |

## Preserved invariants (no regressions)

- Hadith title selector `src/lib/hadithChapterTitle.ts` untouched; chapter-97 stale override still absent; 291/291 parity holds.
- 84 missing Bengali titles remain a localization gap (not corruption); approved Bangla → verified-BN-else-verified-EN fallback intact.
- Quiz textual correct answers never altered for canonicalization; canonical map 31 mappings intact.
- No religious content invented anywhere; unsupported claims suppressed or removed, never rewritten.
- `noorapp-ucmi` untouched; deploys only via `noorappold` when authorized.

## Human decisions required (open)

1. Rotate the exposed Lovable API key (Lovable dashboard).
2. Configure `SCHEDULER_CRON_SECRET` in Supabase + `noorappold`; decide the Vercel cron mechanism (query-string secret vs `Authorization` header vs dashboard cron); `* * * * *` needs a Pro plan; update the pg_cron caller to send the header.
3. Review + apply `P0-2-stale-schedules-migration.sql` (privileged); retire the legacy pg_cron job.
4. Review + apply `P0-3-geolocation-rls-migration.sql` (privileged; verify live policies + `device_id` uniqueness first).
5. Apply the privileged dua virtue DB cleanup (`DUA_CLEANUP_FINAL_2026-09-28.csv`); scholar-verify the 11 `explanation_*` texts with exact citations before any write.
6. Scholar review for 10 class-C surahs + 3 hadith chapters (78, 80, 82); 81 hadith chapters have no verified intro.
7. Quiz: trio-pair thirds (Ar-Rahman, Al-Malik), Allah-count convention, 3 near-duplicate classifications, 11 privileged answer-key DB fixes.
8. Full read-only `benefits_*` language audit (TRK2-023).
9. Post-deploy: live verification of 301s/404s/noindex/availability copy/story parity/push-gate denials.

## Deployment status

**NOT DEPLOYED.** All 10 commits are local and unpushed. No deployment was invoked; no partial deployment exists. The live production endpoints for P0-1 and P0-2 remain in their vulnerable state until the authorized deployment (with secrets configured) is deliberately executed.
