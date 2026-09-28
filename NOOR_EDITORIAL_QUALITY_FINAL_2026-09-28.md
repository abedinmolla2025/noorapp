# Noor App — Editorial-Quality Phase: Final Report (2026-09-28)

**Authorization:** AUDIT → FIX SAFE ISSUES → TEST → RE-AUDIT → DEPLOY IF NEEDED → VERIFY PRODUCTION → REPORT
**Scope:** quiz duplicates/explanations/indexation, dua virtue verification + cleanup manifest, scholar-source requirement audit, re-audit, conditional deploy, ten-factor AdSense-readiness verdict.
**Stop conditions honored:** privileged DB access (not available — stopped), scholar/source verification (matrix produced, no publishing), destructive/irreversible actions (none taken), secrets/credentials (none requested, none used).

---

## 1. Phase 1 — Quiz forensic audit (read-only) ✅

Report: `QUIZ_FORENSIC_AUDIT_2026-09-28.md`. All 313 active rows examined:

- 281 index-eligible · 28 disputed · 4 needs-review
- 22 normalized exact duplicate groups → **30 deterministic duplicate→primary pairs**
- 131 template-sibling pairs classified as distinct educational content (kept separate)
- 34 duplicate answer-set groups, 40 identical-explanation groups (reviewed; not consolidated — answer-set identity alone is not redundancy)
- All 313 rows have 4 options, Bengali + English explanations, and `source_reference`
- Explanation lengths (EN): min 55 / median 121 / max 431 chars; 15 thinnest sampled → 0 failures

## 2. Phase 2 — Quiz consolidation (safe fix) ✅

Render-layer canonicalization, no DB changes, no deletions, no invented content.

- `scripts/generate-quiz-canonicals.py` re-derives the 22 exact groups deterministically and validates each near-duplicate pair (identical explanations **and** identical correct-answer text); retention rule: `question_bn > source_reference > editorial_note > order_index`.
- **30 duplicate→primary mappings** in `src/data/quiz-duplicate-canonicals.json`.
- 3 ambiguous pairs (`4a1fb4fe/6b730819`, `30d24f16/218548e4`, `30fecbf8/30d473e5`) and `EXACT-38` (Ayatul Kursi pair) recorded in `records/` — **not** mapped; they remain indexed and self-canonical pending editorial review.
- A genuine bug was caught and fixed pre-commit: an undefined `canonicalUrl` variable briefly emitted empty canonicals on all 30 duplicate prerender pages (found by a targeted audit, fixed by deriving the primary at module load).

## 3. Phase 3 — Quiz explanation quality (all 313 rows) ✅

- 0 missing Bengali explanations · 0 missing English explanations · 0 missing source references · 0 invalid correct-answer indexes.
- No expansion performed: explanations come from the source data; inventing depth is forbidden. Thinnest rows verified adequate, not filler. Median 121 chars EN remains thin — flagged as residual risk (Factor 4).

## 4. Phase 4 — Quiz duplicate URL indexation ✅

- Duplicate `/quiz/<id>` pages: HTTP 200 + `index,follow` + `<link rel="canonical">` pointing at the primary; SPA canonical/og:url/JSON-LD updated identically (`QuizDetailPage.tsx`).
- Sitemap excludes the 30 duplicate IDs: **1,003 → 973 URLs**. Fail-safe: a missing mapping file excludes nothing.
- Verified locally (30/30 routes, 251 quiz-detail URLs in sitemap, 0 duplicates present, 0 primaries missing) and on production.

## 5. Phase 5 — Dua virtue verification + cleanup manifest ✅ (STOPPED per rules)

Read-only re-verification of 218 published dua rows (`admin_content`, `content_type=dua`, `status=published`):

- **158 rows** carry populated templated virtue claims (8 distinct template texts; `Quran 40:60` on 110 rows).
- **2 rows** are reference-only anomalies (empty virtue, populated virtue_reference).
- **58 rows** are clean (empty virtue + empty reference) — explicitly listed as unchanged.
- **160 affected records total.** An earlier draft misclassified all 218 rows as affected and counted the empty string as a 9th template; the manifest was regenerated from the verified raw data and corrected.
- No DB write attempted: privileged cleanup was RLS-blocked in the prior phase and remains unavailable. Render-layer suppression of `virtue`/`virtue_reference` from commit 48a2286 remains live, so no user-visible templated claims remain. Manifest: `DUA_VIRTUE_CLEANUP_MANIFEST_2026-09-28.json`.

## 6. Phase 6 — Surah/chapter introduction source-requirement matrix ✅

`INTRO_SOURCE_REQUIREMENT_MATRIX_2026-09-28.md`:

- Mechanical metadata exists for all 114 surahs and 97 Sahih Bukhari chapters.
- **No verified introductions, overviews, summaries, or contextual scholarly sources** found in repository data or the checked schema.
- **211 underlying introductions require trustworthy sourcing and scholar review** (affects 291 language-specific surfaces for hadith chapters).
- No scholar-style introductions were generated or published — correct per the no-invented-content rule. This is the single largest content gap.

## 7. Phase 7 — Re-audit ✅

- `npm run build`: PASS (large-chunk warning only, pre-existing).
- `tsc`: 80 pre-existing errors, **0 added by this patch** (clean-tree comparison).
- `node scripts/quality-gates.mjs`: **ALL PASS** — sitemap-count 973/973, sitemap-status 973/973, sitemap-robots, sitemap-canonical, sitemap-no-ads, invalid-routes 8/8, duplicate-titles 973 unique, structured-data, placeholder-leaks, hub-stories 74/74, hub-quiz 281/281, **quiz-consolidation 30/30** (new gate).

## 8. Phase 8 — Deployment + production verification ✅

- Committed `351c8c3` (13 files: 7 modified, 6 new). `.backups/` untouched. No `noorapp-ucmi` changes.
- Pushed `bba9269..351c8c3` via credential-free device flow; ls-remote confirmed.
- Vercel (project `noorappold` only): deployment `dpl_2aXkq78Q7LNfN7JYA6ozubRztMAb` (commit `351c8c3`, target production) → **READY**, alias assigned. No other project touched.
- Production checks on `https://noorapp.in`:
  - Sampled duplicate quiz URLs return 200 + `index,follow` and canonicalize to their primaries (e.g. `05a21517… → 00aa6849…`, `091718c7… → 1773428e…`).
  - Live `sitemap.xml` = **973 `<url>` entries**; duplicate IDs absent, primaries present.

---

## 9. Ten-factor AdSense-readiness assessment

| # | Factor | Status | Evidence |
|---|--------|--------|----------|
| 1 | Duplicate-content hygiene | ✅ improved | 30 forensically-verified duplicate quiz pairs consolidated via canonical hints; sitemap excludes duplicates; 973 unique titles site-wide |
| 2 | Unsupported claims | ✅ improved | Dua virtue/virtue_reference suppressed in render layer (48a2286); exact cleanup manifest ready (160 records) |
| 3 | Invalid-route handling | ✅ pass | 8/8 invalid routes fail closed (404/410 + noindex); no ads on error pages |
| 4 | Explanation/substance depth | ⚠️ residual | Quiz explanations verified adequate but thin (median 121 chars EN); thin-content risk not eliminated |
| 5 | Scholarly sourcing for core content | ❌ open | 211 surah/chapter introductions need verified scholarly sources; none published (correctly, per no-invention rule) |
| 6 | Underlying data cleanliness | ⚠️ residual | Dua virtue DB cleanup still RLS-blocked; render suppression is a mitigation, not the canonical fix |
| 7 | Residual duplicate/editorial groups | ⚠️ residual | 3 ambiguous pairs + EXACT-38 + 28 disputed/4 needs-review records await editorial resolution |
| 8 | Indexation hygiene | ✅ pass | Sitemap 973, all self-canonical, all index,follow, canonicals verified on production |
| 9 | Trust pages / policy compliance | ✅ pass | About/Contact/Sources/Privacy/Terms present; no AdSense on noindex pages; AdSense loader gated to admin config |
| 10 | Site completeness | ✅ pass | 74 stories, 281 quiz questions, hubs with CollectionPage JSON-LD; no placeholder leaks |

**Remaining blockers (documented, not fixable in this phase):**
1. Privileged DB cleanup of 160 dua virtue records (RLS-blocked; boundary requires stopping).
2. 211 surah/chapter introductions requiring verified scholarly sources (source verification needed; nothing may be invented).
3. Thin quiz explanations (median 121 chars EN) — low-value-content risk.
4. 3 ambiguous duplicate pairs + EXACT-38 + disputed/needs-review records pending editorial review.

---

## Verdict

**NOT YET READY**

This phase closed the quiz-duplicate indexation gap (30 pairs consolidated, sitemap 1,003 → 973, all gates green, production verified), verified explanation integrity across all 313 rows, corrected the dua cleanup manifest to its exact affected set (160 records; 58 clean rows explicitly unchanged), and mapped the scholar-source requirement (211 introductions). The three structural blockers from the prior phase remain by rule, not by oversight: the dua virtue DB cleanup cannot proceed without privileged write access, the 211 introductions cannot be written without verified scholarly sources, and quiz explanations remain thin. No AdSense review was submitted. No approval is guaranteed at any point.

**Deliberately not done:** no DB writes (no privileged access); no deletion of quiz records; no merging of distinct educational questions; no invented religious content or citations; no `.backups/` changes; no `noorapp-ucmi`, DNS, domain, env, or ads changes.
