# Quiz Article-Pairs — Duplicate Determination (2026-09-28)

Independent determination on the two trios previously blocked because the correct-answer
TEXT differs only by the article "the". The pipeline's textual safety invariant
("never merge rows whose correct-answer TEXT differs") was **NOT weakened**; no merge
is authorized here. This is a duplicate-determination report only.

Machine-readable: [quiz_article_pairs.json](sandbox://workspace/noorapp/research/quiz_article_pairs.json)

## Verdicts

| Trio | Members | Verdict | Proposal (deterministic) | Status |
|---|---|---|---|---|
| Ar-Rahman | `dbaf94d7` vs `cb669489` (+ `1653909f` already mapped) | **GENUINELY DUPLICATE** | `dbaf94d7-c956-476d-b04c-740b12bf98db → cb669489-b332-4da8-9558-a000f215471d` | **NOT APPLIED** — blocked by textual invariant; human decision |
| Al-Malik | `79b5109a` vs `7f596085` (+ `404b63d2` already mapped) | **GENUINELY DUPLICATE** | `79b5109a-17c7-4de2-a538-dee67e631215 → 7f596085-398f-4565-a6d8-42c37635fe1d` | **NOT APPLIED** — blocked by textual invariant; human decision |

## Why genuinely duplicate (per trio)

- **Same question.** "What does X mean?" vs "What is the meaning of X?" is pure paraphrase; no pedagogical distinction.
- **Same answer, semantically.** "The Most Merciful" ≡ "Most Merciful"; "The Sovereign/King" ≡ "Sovereign King". The article "the" is the English rendering of the Arabic definite article (Al-). quran.com's Saheeh International renders 59:22 as "the Entirely Merciful" and 59:23 as "the Sovereign" — presence/absence of "the" is stylistic, not semantic.
- **Same distractors in kind.** All distractors are other divine attributes (Almighty, All-Knowing, Creator, Holy, Merciful, Protector, …). Swapping one attribute for another does not change difficulty or the knowledge being tested. Each question is one-bit: know the name's meaning or not.
- **Identical explanations** (byte-identical after normalization) and identical source (Quran 59:22 / 59:23).

## Fact verification (independent, via quran.com API)

- Quran 59:22: "…He is the **Entirely Merciful**, the Especially Merciful." → Ar-Rahman = the Most Merciful. VERIFIED.
- Quran 59:23: "…**the Sovereign**, the Pure, the Perfection…" → Al-Malik = the Sovereign King. VERIFIED.

## Why not applied

The pipeline's safety invariant compares correct-answer **text**. `"most merciful" ≠ "the most merciful"` and `"sovereign king" ≠ "the sovereignking"` as strings, so the existing generator would abort on these edges. Weakening the comparison (e.g., stripping articles) would be a policy change, not an evidence application, and could mask real differences in other cases. The deterministic proposals above are ready to add as render-layer canonical hints (same mechanism as the 31 committed mappings) if a human decides the article-only difference is acceptable — or the human may instead keep both indexed, in which case the reason is: near-identical pages remain separately indexed because the textual safety invariant was deliberately preserved.

## Notes

- Retention rule applied: Bengali text > source reference > editorial note > row order. Both winners (`cb669489` order 0, `7f596085` order 0) also keep the existing mapped members (`1653909f`, `404b63d2`) under the same primary, so each trio would collapse to a single primary.
- Data-quality wart flagged (not a merge blocker): `7f596085`'s correct option text is "The Sovereign/King" (contains a slash). It sits on the already-chosen primary; flagged for editorial awareness.
- No app code modified. No DB reads beyond read-only row fetches; no writes.
