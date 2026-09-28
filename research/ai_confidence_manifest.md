# AI Confidence Manifest (2026-09-28)

Every AI-generated content proposal in this phase, rated HIGH / MEDIUM / LOW.
Only HIGH may be automatically published. Nothing here claims scholar review.

## HIGH — applied / apply-ready

| Proposal | Evidence | Status |
|---|---|---|
| 9 surah intros (68, 91–95, 100–102) | ≥2 independent sources per claim, excerpts on file | Applied to working tree (this deploy) |
| 31 surah source remediations | 2 live primary APIs, 100% cross-check, excerpts on file | Applied to working tree (this deploy) |
| Source-transparency labels (primary/secondary + caption) | Presentation only; no factual claims | Applied to working tree (this deploy) |
| 5 quiz explanation drafts | Restate packet evidence only | Proposal-only (DB blocked) |
| Ayatul Kursi canonical f3b63b75→330d1142 | Row reads refuted conflict | Already live (e9cebde) |

## HIGH — proposal-only (blocked by access/decision, not evidence)

| Proposal | Blocker |
|---|---|
| 5 quiz VERIFIED_CORRECT fixes | Privileged DB access (RLS) |
| 5 quiz VERIFIED_RETIRE | Privileged DB access + human publication decision |
| 19 dua reference fixes (40:60→2:222) | Privileged DB access (RLS) |
| 52 dua template suppressions | Privileged DB access (RLS) |
| 2 trio canonical proposals (Ar-Rahman, Al-Malik) | Human decision (textual invariant) |

## MEDIUM — needs additional evidence

| Item | Gap |
|---|---|
| 10 class-C surah intros | Genuine Makki/Madani authority conflicts |
| 9 theme-trimmed surah intros (mechanical-only) | Theme claims need 2nd strong tafsir source |
| Hadith chapter intros (pending agent) | Awaiting re-research verdicts |

## LOW — do not publish

| Item | Reason |
|---|---|
| Bengali/Urdu intro translations | No verified translation evidence |
| Any "scholar verified" labeling | No scholar available — never claimed |
| Guesses on conflicting quiz records (3) | Evidence conflicts; policy forbids guessing |

## Audit trail (Phase 12)

Every applied change in this deploy carries BEFORE → PROPOSED → EVIDENCE →
AFTER in: `research/surah_reresearch_19.json` (9 intros),
`research/surah_source_remediation.json` (31 remediations + 10 restorations).
Render-layer proposals (quiz/dua) are documented in
`research/quiz_c_reresearch_proposals.sql` and `research/dua_evidence_full.*`
with no execution.
