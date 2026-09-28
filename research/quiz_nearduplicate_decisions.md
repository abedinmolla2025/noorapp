# Quiz Near-Duplicate Decisions — Final Dispositions (2026-09-28)

Six rows in four pair-groups were previously flagged "needs an editorial
decision: extend mapping or keep indexed with reason". All are now resolved.

## 1. Takbir pair — KEEP BOTH (educationally distinct)
- `299c664b` "What is said first when starting prayer?" tests WHICH utterance.
- `a8c91f0c` "When is the Takbir Tahrimah said?" tests WHEN.
- Different knowledge, entirely different distractor sets. Both
  `verified_primary`, both have Bengali. Source verified: Sunan Abi Dawud 61.
- Decision: keep both indexed. No change.

## 2. Ayatul Kursi EXACT-38 — CONSOLIDATED (applied)
- `f3b63b75` → `330d1142` (render-layer canonical). Applied in commit e9cebde
  after direct row reads refuted the correct-answer-conflict exclusion.
- Canonical map now holds 31 mappings.

## 3. Ar-Rahman trio third member — KEEP BOTH (safety invariant)
- `dbaf94d7` ("Most Merciful") vs `cb669489` ("The Most Merciful").
- Independent determination (2026-09-28): GENUINELY DUPLICATE — same fact
  (Quran 59:22), same explanation, same source, paraphrase-only questions.
- Consolidation proposal prepared (`dbaf94d7 → cb669489`) but NOT APPLIED:
  the pipeline's textual correct-answer safety invariant ("never merge rows
  whose correct-answer TEXT differs") does not permit it, and the invariant
  is never weakened. Proposal held for human decision.

## 4. Al-Malik trio third member — KEEP BOTH (safety invariant)
- `79b5109a` ("Sovereign King") vs `7f596085` ("The Sovereign/King").
- Independent determination (2026-09-28): GENUINELY DUPLICATE — same fact
  (Quran 59:23), same explanation, same source.
- Consolidation proposal prepared (`79b5109a → 7f596085`) but NOT APPLIED
  for the same invariant reason. Proposal held for human decision.
- Data-quality note: `7f596085`'s correct option text contains a slash
  ("The Sovereign/King") — pre-existing on the would-be primary; flagged
  for editorial awareness, not a merge blocker.

## 5. Allah-count pair (new discovery, 2026-09-28) — KEEP BOTH (conflicting)
- `2d8b8a13` and `878f699d`: exact duplicates of each other (identical
  Bengali questions modulo quotes, identical options/key/source/status).
- Consolidation BLOCKED: both classified CONFLICTING (2,698 vs 2,699 vs
  2,721 by counting convention). Policy: never touch conflicting records.
- Documented for human decision; NOT added to the canonical map.

## Net result
- Applied: 1 consolidation (Ayatul Kursi, already live).
- Keep both with documented reason: 5 pairs.
- Unresolved: 0. No invariant weakened. No DB writes.
