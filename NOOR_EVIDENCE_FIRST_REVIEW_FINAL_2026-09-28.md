# NOOR APP — EVIDENCE-FIRST EDITORIAL REVIEW: FINAL REPORT

Date: 2026-09-28 (IST)
Production: https://noorapp.in
Pre-phase production commit: f6d203f
Mode: editorial/source-verification only. No content invented, no citations invented,
no scholar names invented, no DB writes, no RLS bypass, no AdSense submission,
no Vercel/DNS/domain changes.

---

## 1. 211 scholar records — exact status

Deliverable: `SCHOLAR-REVIEW-211.csv` (211 rows, 8 required columns).

| Status | Count |
|---|---|
| VERIFIED | 0 |
| PARTIALLY VERIFIED | 0 |
| UNVERIFIED | 0 |
| NOT PUBLISHABLE WITHOUT SCHOLAR REVIEW | **211** |

Repository evidence checked per record:
- 114 surahs (`src/data/quran_surahs.json`): only 6 mechanical fields
  (number, name, englishName, englishNameTranslation, numberOfAyahs, revelationType).
- 97 chapters (Supabase `hadith_chapters`, read-only): no introduction field exists.
- `public/data/sahih_bukhari_en.json` / `sahih_bukhari_ur.json`: hadith-level records only.

**No introduction-like text exists for any of the 211 items anywhere in the
repository.** Mechanical metadata is already published and is explicitly not the
introduction. Proposed action on all 211: keep NOT_PUBLISHED until a scholar sources
a verified introduction from a named scholarly work with a citation, and a reviewer
approves the wording.

## 2. 17 quiz C records — exact status

Deliverable: `QUIZ-SOURCE-REVIEW-17.csv` (17 rows).

- REQUIRES VERIFICATION: 17 / evidence-backed improvements proposed: **0**.
- Significant finding: every explanation is already honest — each flags its own
  evidentiary caveat. The defects live in the **questions and answer keys**, not the
  explanations, so no explanation-level improvement is possible without external
  verification. Nothing was rewritten; nothing invented.
- Notable cases for the human reviewer:
  - `9322e182`: answer key says 20 prophets; conventional list is 25 (answer-key error; key deliberately untouched pending scholar sign-off)
  - `942d1620`: question premise is false (no surah mentions all 99 names); fix or retire
  - `1e8646d1`: row's own source reports 13 minarets while the key selects 9; date-scoping or key correction needed
  - `2d8b8a13`/`878f699d` and `fa6b14bc`/`47cebbaf`: already-consolidated duplicate pairs sharing one issue each (resolve once per pair)
  - `f4f1cb3c`, `bf41f99d`, `acc3a306`: need the school/edition named in the question stem (question fixes, not explanation fixes)

## 3. 62 quiz D records — exact status

Deliverable: `QUIZ-EDITORIAL-REVIEW-62.csv` (62 rows).

| Phase-3 sub-class | Count |
|---|---|
| A — genuinely useful as-is | 37 |
| B — requires editorial review | 0 |
| C — duplicate / near-duplicate | 20 |
| D — unsupported | 0 |
| E — should remain concise | 5 |
| F — requires verified source | 0 |

- 56 rows OK AS IS; 6 rows REQUIRES VERIFICATION — unmapped near-duplicates needing
  an editorial decision: Ar-Rahman 3rd member, Al-Malik 3rd member, Ayatul Kursi pair
  (EXACT-38, previously excluded), Takbir pair. Decision: extend the canonical mapping
  or keep both indexed with a documented reason.
- Of the 20 sub-class-C rows, 14 are already covered by the 30-pair canonical mapping.
- No row was lengthened for its own sake; brevity was preserved where brevity is correct.

## 4. 160 Dua cleanup records — exact status

Deliverable: `DUA_CLEANUP_FINAL_2026-09-28.csv` (160 records).

- 158 templated virtue claims (incl. `Quran 40:60` on 110 rows) + 2 reference-only anomalies.
- Each row: record ID, slug, problematic field, problem type, current value preview,
  intended safe action (privileged SQL NULL-out per `NOOR_DUA_VIRTUE_FORENSIC_AUDIT.md`),
  verification required (privileged re-read of all 160 rows post-write),
  current publication state (row published; virtue fields suppressed in render; no user-visible claim).
- **No write attempted** — RLS-block already proven three independent ways. The 58 clean
  rows are explicitly excluded from the manifest. Render-layer suppression remains active.

## 5. What can be safely fixed automatically

Nothing content-related. The 6 unmapped near-duplicates are editorial decisions (these
pairs were deliberately excluded from prior mapping), not automatic fixes. The 17 C-rows
need question/answer-key-level human decisions. The 211 introductions need scholar sources.
No automatic content change is safe under the evidence-first rule.

## 6. What requires human/editorial review

- 6 near-duplicate pairs (extend mapping vs. keep indexed with documented reason)
- 17 C-rows (question/answer-key corrections; possible retirement of `942d1620`)
- Residual from earlier audits: 28 disputed + 4 needs-review records, 3 ambiguous pairs, EXACT-38

## 7. What requires scholar/source verification

- 211 introductions: a named scholarly work, a citation, and reviewer-approved wording
  per record — before anything is published.
- 17 C-rows: the claims behind the questions and answer keys.

## 8. Production change

**None.** This commit adds review artifacts only (4 CSVs + this report). No application
code, religious content, database rows, sitemap, or deployment configuration was changed.
The 4 new files are `SCHOLAR-REVIEW-211.csv`, `QUIZ-SOURCE-REVIEW-17.csv`,
`QUIZ-EDITORIAL-REVIEW-62.csv`, `DUA_CLEANUP_FINAL_2026-09-28.csv`.

## 9. Current production commit

- Pre-phase: `f6d203f`
- This report committed as part of the evidence-first review commit (SHA recorded in the commit message log).

## 10. AdSense review

Remains paused. No review submitted, no ads activated, no approval claimed or guaranteed.

---

## Phase 7 — re-audit results

| Check | Result |
|---|---|
| Build (`npm run build`) | PASS |
| TypeScript | 80 errors, all pre-existing, **0 added** |
| Quality gates | **12/12 PASS** (sitemap 973/973, robots, canonicals, no-ads, 8/8 invalid routes closed, 973 unique titles, structured data, placeholders, story hub 74/74, quiz hub 281/281, quiz-consolidation 30/30) |
| Duplicate audit | Mapping regenerated from live data — **byte-identical, no drift** (313 rows, 30 pairs) |
| Indexation / canonical / structured-data | PASS (via gates) |
| Source integrity | No invented content in any artifact; render suppression intact |

---

## FINAL VERDICT: NOT YET READY

Based only on documented evidence. The review packets are complete and production is
technically healthy, but the blockers are unchanged in kind: 211 introductions await
scholar sourcing, 17 quiz records await source verification, 160 Dua rows await
privileged DB cleanup, and 6 near-duplicate pairs await editorial decisions. AdSense
review stays paused until human/scholar input resolves these.
