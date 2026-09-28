# NOOR Evidence-First Remediation — Final Report (2026-09-28)

Continuous execution: RESEARCH → CROSS-CHECK → EVIDENCE SCORE → DRAFT → VALIDATE → APPLY ONLY VERIFIED CHANGES → RE-AUDIT.

## Mutation ledger

### Change 1 — Surah introductions (95 published)
- **BEFORE:** `/quran/<n>` pages showed name, English translation, ayah count, মক্কী/মাদানী badge, and translator attribution — no introduction prose on any of the 114 surah pages.
- **PROPOSED:** Publish introductions only for surahs whose *every* published claim reached VERIFIED (≥2 independent reputable sources, exact excerpts on file).
- **EVIDENCE:** `research/surah_intros_001_057.json`, `research/surah_intros_058_114.json` — per-claim evidence packets with claim→source mapping. All 95 drafts were re-validated sentence-by-sentence against VERIFIED claims only; the 25 flagged records with non-VERIFIED claims in their packets were confirmed to exclude those claims from the published text.
- **AFTER:** `src/data/surah-intros.json` (95 entries: intro_en + up to 3 external sources each) → copied to `public/data/surah-intros.json` by `scripts/extract-tool-data.mjs` → rendered in `src/pages/QuranPage.tsx` (SPA) and `api/prerender.js` (bot HTML) with source attribution. Surahs without a verified intro render nothing — no placeholder.

### Change 2 — Quiz canonical f3b63b75 → 330d1142
- **BEFORE:** 30 duplicate→canonical mappings; EXACT-38 (Ayatul Kursi pair) excluded for alleged "correct-answer conflict".
- **PROPOSED:** Re-admit EXACT-38; retention rule (Bengali > source > editorial note > row order) picks 330d1142.
- **EVIDENCE:** Direct row reads 2026-09-28 — both rows teach "albaqarah", identical explanations, same source (Quran 2:255), both `verified_primary`. The exclusion reason is refuted by the data. Evidence file: `research/quiz_pairs.json`.
- **AFTER:** 31 mappings; `/quiz/f3b63b75-…` now emits `<link rel="canonical" href="https://noorapp.in/quiz/330d1142-…">` (verified via simulated prerender). All 30 prior mappings byte-identical. Render-layer only — no DB change.

### Deliberately NOT applied
- Quiz C-record SQL (`research/quiz_c_proposals.sql`): 4 UPDATE proposals stay proposal-only — RLS blocks writes; Bengali draft translations are marked REVIEW-TRANSLATION and unverified; retirements need a publication-state decision.
- Dua migration (`research/dua_cleanup_migration.sql`): not executed — RLS blocks writes; render-layer suppression remains active.
- Ar-Rahman / Al-Malik trio third members: semantically identical answers but correct-answer *text* differs by the article "the"; the pipeline's textual safety invariant (never merge rows with differing correct-answer text) was deliberately NOT weakened. Escalated to Queue B for human decision.
- Hadith chapter intros: 0 publishable (Sunnah.com exposes titles/listings, not sourced intro prose). Nothing invented.
- Bengali/Urdu intro translations: none — no verified translation evidence exists.

## A. 211 introductions
| Bucket | Count | Detail |
|---|---|---|
| VERIFIED | 95 | Surahs 1–114 minus below; **published** (Queue A) |
| PARTIALLY_VERIFIED | 9 | Surahs 68, 91–95, 100–102 (Queue B — human review) |
| CONFLICTING | 10 | Surahs 55, 60, 76, 83, 97–99, 107, 112, 113 |
| — of which clean draft | 6 | 55, 76, 83, 97, 98, 99 (draft excludes dispute; Queue B — human may approve) |
| — of which no draft | 4 | 60, 107, 112, 113 (Queue C) |
| Hadith chapters VERIFIED | 0 | 7 partial (1 source each), 90 unverified — **nothing published** |
| **Published** | **95** | Surah pages only |

## B. 17 quiz C-records
KEEP 1 (`7ff963fe`) · CORRECT 2 (proposals: 25 prophets; 13 minarets date-scoped) · RETIRE 4 (proposals) · REWRITE 4 (proposals) · NEEDS_MORE_EVIDENCE 6. **Applied: 0.** All proposals in `research/quiz_c_proposals.sql` remain proposal-only pending privileged DB access, source re-verification, and verified Bengali translations.

## C. Quiz pairs
- Takbir (`299c664b`↔`a8c91f0c`): **keep both** — different knowledge ("what starts prayer" vs "when the opening Takbir occurs").
- Ayatul Kursi (`f3b63b75`→`330d1142`): **consolidated** via render-layer canonical (Change 2).
- Ar-Rahman trio third member (`dbaf94d7`): **not consolidated** — blocked by textual safety invariant; Queue B.
- Al-Malik trio third member (`79b5109a`): **not consolidated** — same; Queue B.

## D. 160 Dua records
A (supported) 19 · B (partial) 89 · C (unsupported) 0 · D (generic/template) 52 · E (conflict) 0 · F (scholar) 0. Patch prepared: null `virtue`/`virtue_reference` on 52 D-records; fix `Quran 40:60`→`Quran 2:222` on 19 A-records. **DB changed: 0 rows** (RLS-blocked, verified three independent ways; render-layer suppression active and re-verified live).

## E. Remaining human/scholar workload
1. Scholar review: 15 Queue B surahs, 4 Queue C surahs, 97 hadith chapters (needs 2+ independent scholarly sources each).
2. 17 quiz C-records: source re-verification + publication-state decisions (4 retirements) + verified Bengali translations.
3. Dua DB cleanup: privileged write access required (52 null-outs + 19 reference fixes).
4. Trio consolidation decisions (2): accept or reject article-normalization for canonical purposes.
5. Bengali/Urdu translations for the 95 published intros (separate verified translation evidence needed).

## F. Production commit
`e9cebde` — "Evidence-first remediation: publish 95 verified surah intros; consolidate Ayatul Kursi quiz duplicate" (pushed `808c9f0..e9cebde` to `origin/main`, ls-remote confirmed). 7 files modified, 21 files added (evidence trail + report). `.backups/` untouched and uncommitted. `noorapp-ucmi` untouched.

## G. Vercel deployment
`dpl_GFUrVJWW9Qrb5tDzBWo1rqjD3Mu8` — **READY** on `noorappold` (commit `e9cebde`). Production live-verified: `/quran/2` serves the intro + sources in bot HTML with no ad scripts; `/quiz/f3b63b75-…` emits canonical to the `330d1142` primary; `/quran/60` (Queue C) renders no intro and no placeholder.

## H. Verdict
**NOT YET READY** for AdSense review. Reasons: 116/211 introductions still unpublished (need scholar sources); 17 quiz records need source verification; dua DB cleanup blocked on privileged access; quiz explanations remain thin where sources don't support expansion. AdSense review stays paused; none submitted; no approval claimed or guaranteed.

What changed today: 95 surah pages gained verified, sourced introductions (the single largest verified-content addition in the remediation arc); quiz duplicate surface consolidated 30→31; zero religious content invented; zero DB writes; zero changes to `noorapp-ucmi`, DNS, domains, env vars, or AdSense configuration.
