# Quiz Forensic Audit — Phase 1 (READ-ONLY, 2026-09-28)

No database writes were performed. No app code was modified. Analysis ran against a
full-table read of `quiz_questions` (313 rows) via the read-only Supabase PostgREST API.

## 1. Dataset

- **Total rows:** 313, all `is_active = true`.
- **verification_status:** verified 67 · verified_primary 199 · verified_secondary 15 →
  **281 indexed** (sitemap + detail prerender + in-app quiz) · disputed 28 · needs_review 4
  (not indexed, not served in-app).
- **Columns present:** id, question, question_en, question_bn (285/313), options,
  options_en, options_bn, correct_answer, explanation_bn (313/313), explanation_en
  (313/313), source_reference (313/313), related_url, verification_status,
  editorial_note (125/313), category, difficulty, order_index, created_at/updated_at.
- **Public URL pattern:** `/quiz/<uuid>` (from `api/sitemap.js:84` and
  `api/prerender.js:2130`). Canonical is self-referential per record id. Sitemap
  includes only the 281 eligible statuses. Invalid ids fail closed (404/410 + noindex).
- **Explanation length (en):** min 55 · median 121 · max 431 chars. Combined bn+en:
  min 119 · median 239 · max 829.

## 2. Summary

| ID | Check | Result |
|----|-------|--------|
| A | Exact duplicate questions (punctuation-insensitive) | **22 distinct row groups** (20 pairs + 2 triples), 46 rows |
| B | Near-duplicate pairs (SequenceMatcher ≥ 0.80, excl. A) | **149 pairs**, of which **18 genuinely redundant**; 131 are template siblings (distinct questions) |
| C | Duplicate answer sets | 34 groups — overwhelmingly legitimate template reuse across different questions |
| D | Identical explanations | 40 groups; 22 overlap A, **18 are reworded-question pairs** |
| E | Rows identical except UUID/metadata | **17 groups** (differ only in `order_index`; one also in `source_reference` wording) |
| F | Little educational value | **0 rows devoid of value**; length-based flagging is not meaningful for quiz format (see §8) |
| G | Explanation does not explain the answer (15 thinnest sampled) | **0 failures** — all 15 directly justify the correct answer (see §9) |

## 3. Section A — Exact duplicate groups (22)

Normalization: NFC, whitespace-collapsed, casefolded, punctuation stripped, matched on
`question_en` and on `question` (Bengali legacy field). Pairs below differ only in
punctuation/quoting unless noted. **21 of 22 groups are fully indexed**
(all rows verified/verified_primary). EXACT-10 is disputed/disputed (not indexed).

| GID | n | IDs (short) | Statuses | Question (en) | Recommended action |
|-----|---|-------------|----------|---------------|--------------------|
| EXACT-01 | 2 | 8c27b6e0, 3e3b31e4 | verified_primary ×2 | How many Fard Rak'ahs are in Jumu'ah (Friday) prayer? | merge-candidates |
| EXACT-03 | 2 | 4e5493a4, c5eb9615 | verified_primary ×2 | What is the meaning of 'Al-Quddus'? | merge-candidates |
| EXACT-05 | 2 | 356fe03f, a7c5492f | verified_primary ×2 | What is the meaning of 'Al-Hakeem'? | merge-candidates |
| EXACT-06 | 2 | 1773428e, 091718c7 | verified ×2 | How many Rak'ahs of Sunnah are there with the Fard prayers? | merge-candidates |
| EXACT-07 | 2 | 2d8b8a13, 878f699d | verified ×2 | How many times does the word Allah appear in the Quran? | merge-candidates |
| EXACT-08 | 2 | 05a21517, 00aa6849 | verified_primary ×2 | Which Prophet is called Kalimullah (The one who spoke to Allah)? | merge-candidates |
| EXACT-09 | 2 | e06d0f16, 49832630 | verified_primary ×2 | Between which two hills is Sai performed? | merge-candidates |
| EXACT-10 | 2 | 70216418, fb5d781f | disputed ×2 | Which companion was given the title Al-Faruq? | merge-candidates (non-indexed) |
| EXACT-11 | 2 | d54ef3fd, cfa59d1a | verified_primary ×2 | Which night of Ramadan is described as better than a thousand months? | merge-candidates |
| EXACT-12 | 2 | 57249de2, 7281acb7 | verified_primary ×2 | In which Surah does 'Bismillah' appear twice? | merge-candidates |
| EXACT-13 | 2 | cc96e45e, 5a9a9c52 | verified_primary ×2 | Which companion was given the title 'Saifullah' (Sword of Allah)? | merge-candidates (retain row with richer source_reference) |
| EXACT-14 | 2 | 3c4ae60a, a8a1f099 | verified_primary ×2 | Which Surah is called 'Umm al-Quran' (Mother of the Quran)? | merge-candidates |
| EXACT-15 | 2 | 0c8c45cd, b6ea5fbd | verified_primary ×2 | How many Sunnah and Fard Rakahs are in Fajr prayer? | merge-candidates |
| EXACT-16 | 2 | b9b8a99d, 22f4fc07 | verified_primary ×2 | What is the meaning of Al-Aleem? | merge-candidates |
| EXACT-17 | 2 | 4481730d, f4f3d5dd | verified_primary ×2 | Which Prophet is called 'Ruhullah' (Spirit of Allah)? | merge-candidates |
| EXACT-18 | 2 | 2035ad7b, 0ba7b20a | verified_primary ×2 | Which battle is called the 'Day of Furqan' (Criterion)? | merge-candidates |
| EXACT-20 | 3 | cb669489, dbaf94d7, 1653909f | verified_primary ×3 | What is the meaning of 'Ar-Rahman'? / "What does Ar-Rahman mean?" | **needs-editorial-review** — dbaf94d7 has different distractors; merge cb669489+1653909f, judge dbaf94d7 separately |
| EXACT-21 | 2 | 6130ba7d, 885164bb | verified ×2 | What is the rate of Zakat? / …in percentage? (categories Pillars vs Zakat) | merge-candidates (retain "…in percentage?" in Zakat category) |
| EXACT-22 | 2 | c9b2b485, 1a52f940 | verified ×2 | Which Surah is called the 'Heart of the Quran'? | merge-candidates |
| EXACT-24 | 3 | 7f596085, 404b63d2, 79b5109a | verified_primary ×3 | What is the meaning of 'Al-Malik'? / "What does Al-Malik mean?" | **needs-editorial-review** — 79b5109a has different options AND different correct_answer index (1 vs 0). Merge 7f596085+404b63d2 only |
| EXACT-38 | 2 | f3b63b75, 330d1142 | verified_primary ×2 | In which Surah is Ayatul Kursi? / …found? | **needs-editorial-review** — different options and different correct_answer index (0 vs 1) |
| EXACT-39 | 2 | 3c67af7a, dab2684d | verified_primary ×2 | In which month is Tarawih/Taraweeh prayer performed? | merge-candidates (same answer; keep better distractor set) |

**Retention rule for merge-candidates** (apply at execution): prefer (1) row with
`question_bn` populated, (2) richer `source_reference`, (3) `editorial_note` present,
(4) lower `order_index` (earlier = original). Within each pair the rows share the same
`related_url`, so internal-link impact of consolidation is nil.

**Why the previous audit reported 8 and this one 22:** the earlier 80-row sample used
strict string equality; punctuation variants (`'Al-Malik'` vs `Al-Malik`) were missed.
Punctuation-insensitive matching over all 313 rows finds 22 groups. Both counts are
consistent — this is the complete set.

## 4. Section B — Near-duplicate pairs (149 at ≥ 0.80)

The large count is driven by **template siblings**: same question template applied to
different entities. These are distinct educational questions and must NOT be merged:

- "How many Fard rakahs in {Asr,Fajr,Maghrib,Dhuhr,Isha} prayer?" 
- "What is the meaning of {Al-Hakeem,Al-Aleem,Al-Malik,…}?"
- "To which people was Prophet {Hud,Salih,Shuaib} sent?"
- "Which scripture did Prophet {Dawud,Isa,Musa} receive?"
- "What is the duty of Angel {Israfil,Mikail,Azrael}?"
- "Who was the {first,third,fourth} Caliph of Islam?", "What was {Umar,Uthman}'s title?"

**18 genuinely redundant pairs** (same underlying question, trivial rewording — all share
identical explanations, §6):

| IDs | Q1 | Q2 | Statuses | Action |
|-----|----|----|----------|--------|
| fa6b14bc / 47cebbaf | In which month did Isra and Miraj occur? | …the Night of Miraj (Ascension) occur? | verified ×2 | merge-candidates |
| 8b2920fd / 790a4853 | Which Surah starts without Bismillah? | Which Surah does not begin with Bismillah? | verified_primary ×2 | merge-candidates |
| 16657e2b / 91508a8f | In which creature's belly was Prophet Yunus (AS)? | In the belly of which creature was Prophet Yunus (AS)? | verified ×2 | merge-candidates |
| 7ad2bb48 / a11d7538 | Who was the first female martyr in Islam? | Who was the first martyr of Islam? | verified_secondary ×2 | merge-candidates |
| 3c721283 / 1ee99660 | What is the first month of the Hijri calendar? | …of the Islamic calendar? | verified_primary ×2 | merge-candidates |
| e2bbb2c7 / 713c1853 | How many verses are in Surah Al-Fatiha? | …in Surah Fatiha? | verified_primary ×2 | merge-candidates |
| 4a1fb4fe / 6b730819 | When should Sadaqatul Fitr be given? | When must Sadaqatul Fitr be given? | verified_primary ×2 | merge-candidates |
| 30d24f16 / 218548e4 | On which day of Hajj is the sacrifice (Qurbani) performed? | On which date is Eid ul-Adha celebrated? | verified_primary ×2 | merge-candidates |
| fdc6963f / e30b5847 | Who was the first Muezzin of Islam? | …in Islam? | verified_primary ×2 | merge-candidates |
| 9e706e3c / 23e49c9e | In which conventional CE year did the Hijrah to Medina take place? | The Hijri calendar starts from the migration to Madinah. Which year CE…? | needs_review / verified | merge-candidates (retain verified 23e49c9e) |
| 62df78df / f2d00410 | What is the virtue of reciting Surah Mulk? | Which Surah protects from the punishment of the grave? | disputed ×2 | merge-candidates (non-indexed) |
| 30fecbf8 / 30d473e5 | What is the duty of Angel Mikail (AS)? | Which angel is responsible for rain and sustenance? | verified ×2 | merge-candidates |
| f4f1cb3c / bf41f99d | How many Sajdah verses are in the Quran? | How many Sajdah of Tilawat are in the Quran? | disputed ×2 | merge-candidates (non-indexed) |
| 608b5612 / 6d56bfe7 | What was the first Qibla? | What was the first Qibla (direction of prayer) for Muslims? | verified_primary ×2 | merge-candidates |
| 1b2bfc00 / 92ceba14 | How many rounds of Tawaf are performed? | How many times must one circle the Kaaba during Tawaf? | verified_primary ×2 | merge-candidates |
| b6dde8f3 / e97e91a8 | At what age did Prophet Muhammad (PBUH) pass away? | How many years did Prophet Muhammad (PBUH) live? | verified_primary ×2 | merge-candidates |
| 299c664b / a8c91f0c | What is said first when starting prayer? | When is the Takbir Tahrimah said? | verified_primary ×2 | **needs-editorial-review** — different question angles sharing one explanation |
| 3334d4ff / a66899e7 | In which month is Shab-e-Barat observed? | Which night is commonly referred to as Shab-e-Barat? | verified / needs_review | merge-candidates (retain verified 3334d4ff) |

Cross-question explanation reuse also flagged (same explanation, related-but-distinct
questions — editorial should decide whether the shared text serves both):
- `09efa818` "What is Surah Yasin called?" shares its explanation with the EXACT-22
  "Heart of the Quran" pair.
- `e48c1867` "What title was given to Khalid bin Walid (RA)?" shares its explanation
  with the EXACT-13 "Saifullah" pair.
- `19f8974a` "What was Umar (RA)'s title?" (disputed) shares its explanation with the
  EXACT-10 "Al-Faruq" disputed pair.

## 5. Section C — Duplicate answer sets (34 groups)

Almost entirely legitimate template reuse across *different* questions
(e.g. `["2","3",…]` for different rakah-count questions; `["Abu Bakr (RA)","Umar (RA)",…]`
for different companion questions). Groups where `same_question=True` coincide with
Section A groups. **No action required** — shared option sets across distinct questions
are normal quiz construction, not duplication.

## 6. Section D — Identical explanations (40 groups)

22 overlap the Section A exact-question groups (expected). The remaining 18 are the
genuinely-redundant reworded pairs listed in §4. No explanation text is shared across
*unrelated* questions.

## 7. Section E — Identical except UUID/metadata (17 groups)

The strictest duplicate set: normalized question + options + explanation +
correct_answer all identical; rows differ **only** in `order_index` (16 groups) or in
`order_index` + `source_reference` wording (EXACT-13). These 17 are the safest
consolidation candidates — zero content risk in merging. (The 5 remaining Section A
groups differ in options/correct_answer/category and are handled as
needs-editorial-review in §3.)

## 8. Section F — Educational value

- A naive length filter (`question_en` < 40 chars) flags 139 rows, but short questions
  are normal and legitimate for a quiz ("What is Kufr?", "What is Tawaf?",
  "What is the meaning of Al-Aleem?"). Length alone is not a value signal.
- **0 rows** lack `source_reference` (313/313 present). **0 rows** have fewer than 4
  options. **0 rows** are tautological or content-free.
- Extreme-short watchlist (< 20 chars, all legitimate definition questions, no action):
  "What is Tawaf?", "What is Shirk?", "What is Kufr?", "What is Nifaq?", "What is
  Taqwa?", "What is Ihsan?", "What is Ikhlas?", "What is Hadith Qudsi?" (21),
  "Who built the Kaaba?", "What is Miswak?", "What is Aqiqah?", "What is Itikaf?".
- **Conclusion: no low-value rows identified; nothing flagged for removal.**

## 9. Section G — Explanation quality sample (15 thinnest)

The 15 shortest `explanation_en` values (55–81 chars) were each checked against the
question and correct answer. **All 15 directly justify the correct answer**; most cite
the source or eliminate distractors. Examples:

- `a864a7ec` — Q "What does Al-Khaliq mean?" / A "Creator" / E "Al-Khaliq means the
  Creator, as used in Surah al-Hashr." → adequate.
- `07b69880` — Q "To which people was Prophet Hud (AS) sent?" / A "Aad" / E "Al-Araf
  explicitly identifies Hud as sent to Ad, not Thamud or Madyan." → adequate, addresses
  distractors.
- `aa8fb18c` — Q "How many rakahs is the Eid ul-Fitr prayer?" / A "2" / E "Eid al-Fitr
  prayer has two rakahs; its extra takbirs do not add rakahs." → adequate, clarifies
  common confusion.
- `582c4d78` — Q "In which direction is the Qibla?" / E "The qiblah is the direction of
  the Kaaba in Makkah, not universally west or east." → adequate.

**No fabricated citations, no mismatched answers, no explanation that fails to support
its answer were found in the sample.** Thinness here is a depth opportunity, not a
correctness defect. Expanding any explanation requires per-row source support and is
Phase 3 work — nothing may be invented.

## 10. Indexation impact of the duplicate groups

- 21 of 22 Section A groups: **all rows indexed** (`/quiz/<uuid>`, self-canonical,
  in sitemap). Each group therefore publishes 2–3 near-identical indexed pages —
  the active duplicate-content pattern.
- EXACT-10 (Al-Faruq): disputed/disputed — not indexed, not in sitemap, not served
  in-app (P2 filter). Consolidation is still valid but has no indexation impact.
- 16 of 18 genuinely-redundant §4 pairs are fully indexed; 2 involve a
  needs_review row (not indexed).
- Internal links: duplicate rows share identical `related_url` values, and the
  per-page "আরও কুইজ প্রশ্ন" nav is category-derived, so consolidation removes no
  unique internal-link equity. No other page types link to individual quiz UUIDs
  (verified via sitemap/prerender: quiz detail pages are linked from `/quiz` hub and
  from each other's related nav only).
- Consolidation is a **database operation** (delete/supersede rows). It cannot be done
  correctly at the render layer: UUID URLs are self-canonical with no alias mapping,
  so there is no safe code-only canonical/redirect target without a DB-side decision
  of which id survives.

## 11. Recommended actions & execution blockers

| # | Action | Rows affected | Type |
|---|--------|---------------|------|
| 1 | Merge 17 Section E full-duplicate groups (retain per §3 rule) | 34 rows → 17 | DB delete (privileged) |
| 2 | Merge remaining punctuation-only Section A pairs (EXACT-21, 22, 39) | 6 rows → 3 | DB delete (privileged) |
| 3 | Merge 16 indexed genuinely-redundant §4 pairs | 32 rows → 16 | DB delete (privileged) |
| 4 | Editorial review then merge: EXACT-20 (3rd row), EXACT-24 (3rd row), EXACT-38, pair 299c664b/a8c91f0c, explanation-reuse cases (09efa818, e48c1867) | 9 rows | human/scholar decision |
| 5 | Merge non-indexed duplicates (EXACT-10, 62df78df/f2d00410, f4f1cb3c/bf41f99d) | 6 rows → 3 | DB delete (privileged, low priority) |

**Blocker:** actions 1–3 and 5 require privileged database write access, which is not
confirmed available in this phase (previous phase: RLS-blocked writes on
`admin_content`; no write test was authorized on `quiz_questions`). **No deletions were
attempted.** Action 4 additionally requires human/scholar editorial judgment
(correct-answer conflicts must not be auto-resolved).

**Do NOT:** mass-noindex the quiz; noindex-or-delete without the per-group
determinations above; merge template siblings (§4 list); invent explanation content.

## 12. Method note (reproducibility)

All grouping is deterministic: NFC normalization → whitespace collapse → casefold →
punctuation strip. Near-duplicate threshold: `difflib.SequenceMatcher.ratio ≥ 0.80` on
normalized `question_en`, exact groups excluded. Raw row dump and intermediate JSON
were working files in `/tmp` (ephemeral); this report is the durable artifact.
