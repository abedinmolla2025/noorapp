# Noor App — Final Content Quality Blocker Phase: Report (2026-09-28)

**Authorization:** Investigate ONLY the remaining genuine content-quality blockers. Phases A–E. Continue automatically through safe work; stop where a source or privileged-access decision genuinely requires human intervention.
**Hard constraints honored:** no fabricated Islamic content/sources/scholars/citations; no SEO filler; no mass deletion; no mass noindexing; no RLS bypass; no Vercel/DNS/domain changes; no AdSense activation or review submission.

---

## Phase A — Dua database cleanup: BLOCKED

Read-only determination, verified three independent ways against the exact 160-record manifest (`DUA_VIRTUE_CLEANUP_MANIFEST_2026-09-28.json`):

1. **Counts re-verified live:** 218 published dua rows = 158 templated virtue claims + 2 reference-only anomalies + 58 clean rows. Unchanged.
2. **No-op PATCH probe** (identical values) on an affected row: HTTP 204, but `updated_at` unchanged — the write did not execute.
3. **Sentinel write+restore round-trip** on one affected row: the sentinel value never persisted on re-read; the row returned its original value. PostgREST's 204 was a "0 rows affected" response.

**Conclusion: DB cleanup remains blocked by RLS.** No mutation attempted, no backup required (nothing was written), no RLS policies touched, no credentials exposed or sought. The corrected 160-record manifest stands as the exact cleanup plan for whoever holds privileged access. Render-layer suppression of `virtue`/`virtue_reference` (commit 48a2286) remains active — verified live today: zero templated virtue text leaks on dua pages.

## Phase B — Scholar-sourced surah/chapter introductions: matrix built, nothing published

`SCHOLAR_SOURCE_REQUIRED_211.csv` (211 data rows + header, verified) + `SCHOLAR_SOURCE_REQUIRED_211.md`.

- 114 surah rows (`/quran/<n>`) + 97 hadith chapter rows (3 language routes each: `/hadith/sahih-bukhari/{english,bangla,urdu}/chapter-<n>`; 291 language surfaces).
- Columns: route, content_needed (generic description only), source_currently_available (mechanically verified fields, e.g. surah `numberOfAyahs, revelationType`; chapter `title, hadith_count`), missing_source, verification_status, publication_status.
- All 211 rows: `verification_status=UNVERIFIED`, `publication_status=NOT_PUBLISHED`.
- Zero invented content: no revelation context, no Makki/Madani claims, no historical background, no virtues, no interpretations, no quotations, no scholar names, no citations. Mechanical metadata confirmed complete and sequential; `title_ar` noted as frequently empty (recorded as-is).

No introductions were generated or published. The CSV is the scholar workflow input.

## Phase C — Quiz explanations: triaged, not padded

`QUIZ_EXPLANATION_TRIAGE_2026-09-28.csv` (313 rows) + `QUIZ_EXPLANATION_TRIAGE_2026-09-28.md`. Every explanation read in full; classification by educational value, not word count:

| Category | Count | Meaning |
|----------|-------|---------|
| A — already educational/useful | 234 | No change needed |
| B — safely improvable from row data | 0 | No row qualified; proposals drafted: 0 |
| C — requires external/source verification | 17 | Actionable verification list (e.g. `9322e182` answer-key vs conventional list; `2d8b8a13`/`878f699d` 2698-vs-2699 discrepancy; `fa6b14bc`/`47cebbaf` Miraj month lacking authentic source) |
| D — correctly concise | 62 | Expansion would be filler or need unsupported claims |

**B = 0 is an honest finding, not a gap:** the thinnest rows are complete one-liners; the only row-data-only additions available would be padding. Median ~121 chars reflects conciseness, not deficiency — expanding would create the SEO filler this phase forbids. Also verified: 0 missing explanations, 0 template artifacts, 0 language mismatches, EN/BN parity healthy.

**Duplicate audit re-run: NO DRIFT.** Re-derived from live data with the generator's normalization logic: 22 exact groups, all near-duplicate pairs validate as before, regenerated mapping byte-identical to the committed 30-pair `quiz-duplicate-canonicals.json`.

## Phase D — Final quality audit (10 checks)

1. **Duplicate content** — 973 unique titles; 30 pairs canonicalized; re-run shows no drift. ✅
2. **Thin content** — triaged by value (A234/D62/C17), not length; zero filler added. ✅ (17 C rows residual)
3. **Unsupported claims** — dua virtue suppressed in render, verified live with zero leaks. ✅ mitigated (DB cleanup blocked)
4. **Source transparency** — /sources page; all 313 quiz rows carry `source_reference`. ✅
5. **Translation attribution** — Muhiuddin Khan credit in surah bot HTML, verified live. ✅
6. **Internal linking** — hub-stories 74/74, hub-quiz 281/281. ✅
7. **Indexation** — sitemap 973 URLs, all HTTP 200, all index,follow. ✅
8. **Canonical correctness** — quiz-consolidation gate 30/30; all sitemap URLs self-canonical. ✅
9. **Structured data** — JSON-LD gates pass. ✅
10. **Religious-source integrity** — zero invented content in any artifact; 211 intros deliberately unpublished. ✅

Quality gates: **ALL PASS** (12/12). Build: PASS. TypeScript: 0 new errors. Production: READY, verified.

## Phase E — AdSense readiness decision

**Verdict: NOT YET READY**

### TECHNICAL BLOCKERS
1. **Dua virtue DB cleanup (160 records)** — RLS blocks writes (proven 3 ways today). Render suppression is a mitigation, not the canonical fix; the templated claims still exist in the underlying data.

### EDITORIAL / SOURCE-VERIFICATION BLOCKERS
1. **211 surah/chapter introductions** require verified scholarly sources — core content pages currently without substantive unique introductions (the precise "low value content" surface). Sourcing requires human scholars; nothing may be invented.
2. **17 quiz explanations (category C)** require external/source verification before improvement.
3. **3 ambiguous duplicate pairs + EXACT-38 + 28 disputed / 4 needs-review quiz records** await editorial review.

**Rationale:** the remaining issues are genuine, documented content-quality gaps — not paperwork. 211 core pages without sourced introductions and 160 DB rows of templated claims are exactly what a "low value content" rejection targets. No AdSense review submitted; no approval claimed or guaranteed.

**Deliberately not done:** no DB writes; no RLS weakening; no invented religious content, sources, scholars, or citations; no SEO filler; no deletions; no mass noindexing; no Vercel/DNS/domain/ads changes.
