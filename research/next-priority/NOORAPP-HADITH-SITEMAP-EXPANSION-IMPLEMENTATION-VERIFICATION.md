# NOORAPP — HADITH NARRATION SITEMAP EXPANSION — IMPLEMENTATION VERIFICATION

Date: 2026-10-05 (IST) · Mode: IMPLEMENTATION + VERIFICATION ONLY. NOT DEPLOYED. NOT PUSHED.

## Objective

Expose the 7,220 existing individual hadith narration pages (`/hadith/h/:slug`) in the sitemap.
Sitemap-discovery change only. Zero content/route/prerender/canonical changes. Zero DB writes.

## Precheck (read-only, independently re-verified)

- `hadiths` count: **7,220** ✓ (matches discovery receipt)
- Unique IDs: 7,220 · unique slugs: 7,220 · null/empty slugs: 0 · non-URL-safe slugs: 0 ✓
- Route `/hadith/h/:slug` exists (`src/App.tsx:120`) ✓
- Prerender branch exists (`api/prerender.js:1273`; default `index,follow`, fail-closed 404 + `noindex,follow`) ✓
- Current live sitemap: **0** `/hadith/h/` URLs ✓ (2,271 total, 0 dupes)

## Implementation

- **File changed:** `api/sitemap.js` ONLY
  - Added `getVerifiedHadithRoutes()` (after `getAllahNameAllowlist()`): paginated `id, slug` fetch from
    `hadiths` (`book_key=eq.bukhari`, `order=hadith_number.asc`), emits `/hadith/h/{slug}` for non-empty
    URL-safe unique slugs; query failure or exception → `[]` (fail-safe: never a partial set)
  - Added one `routes.push(...await getVerifiedHadithRoutes())` call after the 99-names line
  - Mirrors `getVerifiedQuizRoutes()` structure; no unrelated sitemap code touched
- **Files NOT changed:** no DB, no records, no translations, no routes, no prerender, no canonical logic,
  no Baby Names, no 99 Names, no Quran/Dua/Quiz/Stories

## Build verification

- `tsc --noEmit`: **0 errors** ✓
- `npm run build`: **PASS** (29.55s) ✓

## Sitemap counts (local generation through the real handler)

- Baseline (live): **2,271** URLs, 0 dupes
- New (local): **9,491** URLs, **0 dupes**, valid XML
- New hadith URLs: **7,220** (unique) — exactly the expected set
- Diff vs live: **+7,220, all `/hadith/h/`** · removed: **0** · other additions: **0**
- Section stability: Quran 114/114, Dua 219/219, Quiz 250/250, Stories 74/74, chapters 294/294,
  baby-names 1,200/1,200, 99-names 99/99 — all identical

## Full DB-vs-sitemap reconciliation (mandatory)

| Metric | Value |
|---|---|
| DB slugs | 7,220 |
| Sitemap hadith slugs | 7,220 |
| Intersection | 7,220 |
| DB-only | 0 |
| Sitemap-only | 0 |
| Duplicates | 0 |
| URL-safe | 7,220/7,220 |

**RECONCILIATION PASS**

## Live URL verification (Googlebot UA, production — pages already live)

Stratified sample 6/6 PASS — each: 200, correct record/H1 (`Sahih Al-Bukhari — Hadith N`), correct Arabic
(byte-matched fragment), correct Bengali (byte-matched fragment), self-canonical, `index,follow`, Article JSON-LD:
- `bukhari-1` (first), `bukhari-100`, `bukhari-627` (with `explanation_bn`), `bukhari-1000`,
  `bukhari-7563` (last) — distinct lexical ranges
- Invalid slug → **404 + noindex** ✓ (no soft 404)

## Regression checks

- `/hadith` hub: 200 ✓ · chapter page (`/hadith/sahih-bukhari/bangla/chapter-10`): 200 ✓
- `/baby-names` hub + `/baby-names/abrar`: 200 ✓ (1,200 URLs intact in sitemap)
- `/99-names` hub + `/99-names/ar-rahman`: 200 ✓ (99 URLs intact in sitemap)
- No unrelated sitemap additions/removals

## Scale safety

7,220 URLs emitted as the complete authoritative set (no arbitrary batching). This only improves technical
URL discovery. **No claim that Google will index all 7,220 URLs.**

## Deployment status

**NOT DEPLOYED. NOT PUSHED.** Awaiting separate deployment approval.

## Final verdict

**IMPLEMENTATION_READY_FOR_DEPLOYMENT**
