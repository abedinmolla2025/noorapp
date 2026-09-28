# Quiz Near-Duplicate Pairs — Research Summary (2026-09-28)

Read-only research on the 6 unmapped near-duplicate rows (4 pair-groups). Full row data
fetched from Supabase `quiz_questions`; facts verified against the quran.com API and
independent hadith repositories. No writes, no invented claims.

Machine-readable: [quiz_pairs.json](sandbox://workspace/noorapp/research/quiz_pairs.json)

## Verdicts

| Pair-group | Members | Verdict | Recommendation | Confidence |
|---|---|---|---|---|
| Takbir | `299c664b` ↔ `a8c91f0c` | **both_may_remain** | Keep both indexed; no change | high |
| Ayatul Kursi EXACT-38 | `f3b63b75` → `330d1142` | **canonicalize** | Extend mapping: `f3b63b75 → 330d1142` | high |
| Ar-Rahman trio | `dbaf94d7` → `cb669489` | **canonicalize** | Extend mapping (completes `1653909f → cb669489`) | high |
| Al-Malik trio | `79b5109a` → `7f596085` | **canonicalize** | Extend mapping (completes `404b63d2 → 7f596085`) | high |

## Pair-by-pair

### 1. Takbir pair — NOT duplicates
- `299c664b` "What is said first when starting prayer?" tests **which utterance** (Takbir vs Surah Fatiha vs Dua Istiftah vs Thana).
- `a8c91f0c` "When is the Takbir Tahrimah said?" tests **when** (beginning vs end vs ruku vs sujud).
- Different knowledge, entirely different distractor sets. Both `verified_primary`, both have Bengali.
- Source: Sunan Abi Dawud 61 — "The key to prayer is purification; its beginning is takbir and its end is taslim" (text confirmed across independent hadith repositories; the hadith's Arabic: تحريمها التكبير). VERIFIED.
- **Keep both indexed.**

### 2. Ayatul Kursi pair EXACT-38 — genuinely duplicate
- `330d1142` "In which Surah is Ayatul Kursi found?" vs `f3b63b75` "In which Surah is Ayatul Kursi?" — near-identical questions, same answer (Al-Baqarah), identical explanation, same source.
- Retention rule: `330d1142` has Bengali (question + options); `f3b63b75` has none → primary is `330d1142`.
- Source: Quran 2:255 verified via quran.com API (Ayatul Kursi text confirmed). VERIFIED.
- **Canonicalize `f3b63b75 → 330d1142`** (render-layer hint; extends the 30-pair mapping).

### 3. Ar-Rahman trio — 3rd member genuinely duplicate
- `dbaf94d7` "What does Ar-Rahman mean?" vs `cb669489` "What is the meaning of 'Ar-Rahman'?" vs `1653909f` "What is the meaning of Ar-Rahman?" — identical tested fact, answer, explanation, source. Distractor variation doesn't change the knowledge.
- Existing mapping already has `1653909f → cb669489`; retention rule keeps `cb669489` (order 0, Bengali) as primary.
- Source: Quran 59:22 verified via quran.com API ("the Entirely Merciful"). VERIFIED.
- **Canonicalize `dbaf94d7 → cb669489`** (completes the trio; render-layer hint).

### 4. Al-Malik trio — 3rd member genuinely duplicate
- `79b5109a` "What does Al-Malik mean?" vs `7f596085` "What is the meaning of 'Al-Malik'?" vs `404b63d2` "What is the meaning of Al-Malik?" — identical in every material respect.
- Existing mapping already has `404b63d2 → 7f596085`; retention rule keeps `7f596085` (order 0, Bengali) as primary.
- Source: Quran 59:23 verified via quran.com API ("the Sovereign"). VERIFIED.
- **Canonicalize `79b5109a → 7f596085`** (completes the trio; render-layer hint).

## Notes for the parent agent
- The three canonicalizations are safe to apply as render-layer canonical hints (the existing mechanism), consistent with the prior 30-pair mapping and the retention rule (Bengali text > source reference > editorial note > row order). No DB changes involved.
- No rewrite or retirement is recommended for any of the four groups.
- All six rows remain `verified_primary` in the DB; recommendations only add canonical mapping entries.
