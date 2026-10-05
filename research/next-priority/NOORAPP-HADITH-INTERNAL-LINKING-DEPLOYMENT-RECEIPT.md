# NOORAPP — HADITH INTERNAL LINKING: DEPLOYMENT RECEIPT

Date: 2026-10-05 (IST)

## Deployment

- Implementation commit: `94316d1` ("feat: crawlable internal links for hadith narrations (prerender only)")
- Pushed `520147b..94316d1` from `phase13-naas-redirect` to `origin/main`
- `origin/main` confirmed at `94316d1`
- Vercel API returned HTTP 403 on team scope (as in prior deploys); readiness established
  directly against production: new anchors serving ~120s after push
- Target: Vercel `noorappold` → `https://noorapp.in`

## Change summary (api/prerender.js only, +51/−0)

1. Chapter listing pages: compact crawlable index of every narration in the chapter
   (`<a href="/hadith/h/{slug}">`), one bounded small-column query per chapter.
2. Narration pages: prev/next anchors mirroring SPA semantics (same book_key,
   hadith_number ordering, slug IS NOT NULL).
- No new URLs · no sitemap/robots/canonical/route changes · no content changes ·
  numeric-URL P0 behavior unchanged · SPA untouched.

## Production verification (Googlebot UA, live)

| Check | Result |
|---|---|
| Chapter `/hadith/sahih-bukhari/bangla/chapter-1` | 200, self-canonical, index/follow, 7/7 index anchors (`bukhari-1`→`bukhari-7`) |
| Narration `/hadith/h/bukhari-100` | 200, self-canonical, index/follow, 1 H1, prev/next → `bukhari-99` / `bukhari-101` |
| Numeric URL `/hadith/sahih-bukhari/bangla/1/1` | 200, canonical → chapter URL, 0 narration anchors, no index (P0 intact) |
| Invalid slug | 404 + `noindex,follow` |
| Sitemap | 9,491 URLs, 0 duplicates, 7,220 `/hadith/h/` URLs |

Pre-deployment full verification: FULL_7220_VERIFICATION_PASS (7,220/7,220 chapter-index
reconciled, 0 prev/next mismatches across all 7,220 rendered narration pages).

## Deliberately untouched

- `scripts/verify-hadith-title-consistency.mjs` (pre-existing unrelated modification)
- All other files, DB, sitemap, scheduler, keys

## Verdict

**HADITH_INTERNAL_LINKING_DEPLOYMENT_PASS**
