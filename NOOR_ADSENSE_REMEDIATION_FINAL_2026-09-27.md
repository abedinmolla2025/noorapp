# Noor App — AdSense Low-Value-Content Remediation: Final Report (2026-09-27)

Commit: `48a2286` · Vercel deployment: `dpl_FQPei1r5wcsSvuAhZ5EQQ7PMm7Fr` (READY) · Production: https://noorapp.in

## 1. Total indexable URLs before — 1,003
## 2. Total indexable URLs after — 1,003 (unchanged; no page was added, removed, or noindexed)

## 3. HIGH-risk pages before — 160
160 published dua pages carried templated, unsupported virtue claims rendered under a
"ফজিলত" heading: 158 rows shared 8 generic sentences (top: "Dua relieves burden by
turning the heart fully to Allah." ×58), 110 attributed to the same non-specific
"Quran 40:60", and 50 paired with specific references that did not substantiate the
generic text. Zero virtue texts were backed by a specific virtue narration
(forensic audit: `NOOR_DUA_VIRTUE_FORENSIC_AUDIT.md`).

## 4. HIGH-risk pages after — 0
Virtue/virtue_reference rendering is suppressed in both the prerender (bot HTML) and
the SPA, and dua title/description templates no longer promise ফজিলত content. No
public render path exposes the templated claims (verified by code sweep and live
production fetch). The underlying database rows are untouched.

## 5. MEDIUM-risk pages (remaining)
- **Quiz duplicates:** 8 exact-duplicate question texts (each ×2) + ~10 near-duplicate
  pairs across 281 indexed quiz pages. Editorial merge/de-dup decision needed.
- **Quiz explanations thin:** median ~120 chars (bn/en) across indexed pages; all carry
  real source references and honest hedging, but educational depth is low.
- **Stories thin watchlist:** 33/74 stories under 800 chars (thinnest 397 chars).
  Cannot be expanded without fabricating historical detail — kept indexed as-is.
- **EN/UR hadith translators:** genuinely absent from source data; honestly disclosed
  on detail pages ("অনুবাদের অনুবাদকের নাম উৎস-ডেটায় সংরক্ষিত নেই") — not invented.
- **Numeric hadith URLs** previously self-canonicalized (duplicate pair with chapter
  pages) — fixed: now canonicalize to the chapter URL.

## 6. Thin-content groups
- 33 stories under 800 chars (attributed, unique, internally linked — watchlist only).
- 281 quiz pages with median ~120-char explanations.
- `/hadith/sahih-bukhari` hub was a 261-char language chooser — enriched (see §10).

## 7. Duplicate/near-duplicate groups
- Quiz: 8 exact-duplicate question pairs + ~10 near-duplicate pairs (unchanged, flagged).
- Stories: 0 title pairs >0.75, 0 body pairs >0.65 — none.
- Dua: 4 same-`title_bn` pairs across different slugs (distinct Arabic/translations;
  already disambiguated via reference in titles; quality gate: 1,003 unique titles).
- Ayah URLs render the full surah and canonicalize to the surah URL — no duplicate risk.
- Numeric hadith URLs — fixed via canonical consolidation (§11).

## 8. Source-verification gaps
- Dua `virtue`/`virtue_reference`: render-suppressed; DB cleanup requires privileged
  access (RLS-blocked earlier; zero rows changed). Canonical cleanup SQL is in
  `NOOR_DUA_VIRTUE_FORENSIC_AUDIT.md`; backup at `.backups/dua-virtue-backup-2026-09-27.json`.
- 18 story `related_stories` slugs point to non-existent stories — already filtered
  defensively in both prerender and SPA (category fallback); data correction needs
  privileged DB write.
- Surah intros and per-chapter intros: no verified source exists in repo — flagged for
  human/scholar input, not generated.

## 9. Translation-attribution gaps (fixed)
- Surah pages (bot HTML) had no translator attribution — now render "Bengali
  translation: Muhiuddin Khan · via AlQuran Cloud API" (exact SPA string) + মক্কী/মাদানী badge.
- `/hadith/h/:slug` (bot HTML) lacked the SPA's translator disclaimer — now rendered.
- EN/UR hadith translator names: missing from source data, disclosed honestly, not invented.

## 10. Internal-linking improvements
- 114 surah pages: 1 link → 4+ (prev/next surah with names + All Surahs + back link).
- 291 hadith chapter pages: added prev/next chapter navigation (boundary-aware).
- `/hadith/sahih-bukhari` hub: added about-section, live chapter count, /sources link.
- Dua detail: same-category related links already present (all 218 covered); title/desc honest.
- Quiz SPA loader now matches the indexed surface (verified-only).

## 11. Indexation changes — none
1,003 URLs before and after. No page added/removed/noindexed. Invalid
Quran/Dua/Story/Hadith/Quiz/arbitrary routes still fail closed (404/410 + noindex).

## 12. Structured-data changes — none
WebSite, Organization, CollectionPage, Article, BreadcrumbList unchanged; no new
schema types introduced; no FAQPage (no visible FAQ content exists).

## 13. Files changed
- `api/prerender.js` — virtue suppression; surah nav/badge/attribution; hadith
  numeric-URL canonical; chapter prev/next; /hadith/h/:slug disclaimer; Bukhari hub
  enrichment; dua template honesty.
- `src/pages/dua/DuaDetailPage.tsx` — virtue section removed; title/desc templates.
- `src/pages/QuizPage.tsx` — verification_status filter on both loaders.
- `scripts/extract-tool-data.mjs` — copies `src/data/quran_surahs.json` → `public/data/quran-surahs.json` (114-count guarded).
- `vercel.json` — includeFiles adds `data/quran-surahs.json` (single-string schema preserved).
- `public/data/quran-surahs.json` — new build artifact (matches repo convention).

## 14. Git commit SHA — `48a2286`
Pushed `6b96747..48a2286` to `origin/main` (ls-remote confirmed).

## 15. Vercel deployment — `dpl_FQPei1r5wcsSvuAhZ5EQQ7PMm7Fr`, READY, sha `48a2286`
Single deployment on `noorappold` (noorapp-ucmi remains Git-disconnected; produced none).

## 16. Production verification (live, bot UA)
- `/` → 200; `/dua/dua-for-parents` → no ফজিলত heading, no templated virtue, honest title.
- `/quran/112` → prev `/quran/111`, next `/quran/113`, মক্কী badge, Muhiuddin Khan attribution.
- `/hadith/sahih-bukhari` → chapter count + /sources link rendered.
- `/hadith/sahih-bukhari/bangla/chapter-1/2` → canonical = chapter URL.
- `/quran/999`, `/dua/bogus-slug-xyz`, `/hadith/sahih-bukhari/bangla/9999` → 404.
- `robots.txt` OK; `sitemap.xml` = 1,003 URLs; error pages noindex, no ad scripts.

## 17. Remaining blockers
1. Quiz duplicate questions (8 exact + ~10 near pairs) need editorial merge decisions.
2. Quiz explanations need depth enrichment (median 120 chars).
3. Dua virtue DB cleanup needs privileged access (render-suppression is the active mitigation).
4. Surah/chapter intros need scholar-sourced content.
5. 33 thin stories cannot be lengthened without fabrication.

## 18. Recommended next phase
Editorial pass on quiz (de-dup + explanation depth) → privileged dua virtue DB cleanup
→ scholar review of surah/chapter intros → re-audit → then consider AdSense review.

## Validation performed
`node --check` ✓ · extractor (114 surahs) ✓ · `tsc --noEmit` ✓ · `npm run build` ✓ ·
`scripts/quality-gates.mjs` ALL PASS ✓ · 12 targeted prerender assertions ✓ · live
production checks ✓. Lint: 377 pre-existing problems, none introduced by these edits.

## Deliberately not changed
- No Quran Arabic, hadith Arabic, translations, grades, references, or source data touched.
- No page noindexed or removed; sitemap untouched (1,003 URLs).
- No ads enabled; no AdSense review submitted.
- No DB writes; `.backups/` untouched; `noorapp-ucmi` untouched; no DNS/domain changes.
- No invented virtues, intros, translator names, or historical details.

## Final verdict — NOT YET READY (for AdSense review)
The systematic HIGH-risk signal (templated unsupported virtue claims on 160 pages) is
eliminated from the published surface. However: 8 exact-duplicate indexed quiz
questions (+ ~10 near pairs) remain an active duplicate-content pattern, quiz
explanations are thin sitewide, and the canonical dua virtue DB cleanup is still
pending privileged access. Complete the quiz editorial pass and the DB cleanup, then
re-audit before submitting for review. No guarantee of approval is made.
