# Quiz Explanation Triage — 2026-09-28 (Phase C)

**Scope:** all 313 active `quiz_questions` rows. READ-ONLY; no DB writes. No proposals modify questions, options, or correct answers.

## Method

1. Fetched all 313 rows (live Supabase read) with `id, question_bn/en, options_bn/en, correct_answer, explanation_bn/en, source_reference, verification_status`.
2. Read every English explanation in full (sorted by length), plus Bengali spot checks and EN/BN parity checks.
3. Ran artifact/language screens (template tokens, script mismatches) — 0 real issues (2 regex false positives on "nan" inside "finance"/"mentions").
4. Ran a heuristic for explanations not naming the correct option (41 hits) — all were transliteration variants (Madinah/Medina) or deliberate careful phrasing; 0 genuine gaps.
5. Applied the category rules below. B candidacy was tested against the strict traceability rule; no row qualified (see "Why B is empty").

## Category definitions

- **A — already educational/useful.** The explanation directly answers the question with the key fact and adequate source context, or is a substantively educational scholarly explanation (including careful corrective ones that flag weak reports, madhhab differences, or counting conventions). No change needed.
- **B — can safely improve using ONLY existing verified evidence already in that row** (its question text, options, source_reference). The improvement must be strictly traceable — no external facts, no new citations, no new claims, no scholar names, no invented content. Only B rows get expansion proposals.
- **C — requires external/source verification before it can be improved.** The explanation contains an explicit verification caveat, or the underlying answer/question is flagged as unresolvable from row data alone.
- **D — should remain concise.** The explanation is a correct, complete minimal answer; the row's own fields contain no additional safe material, and any substantive expansion would require external facts or be filler. Affirmatively recommend no change (do not pad).

## Counts

| Category | Rows | Share |
|----------|------|-------|
| A — already educational/useful | 234 | 74.8% |
| B — safely improvable from row data | 0 | 0.0% |
| C — needs external/source verification | 17 | 5.4% |
| D — correctly concise, do not expand | 62 | 19.8% |
| **Total** | **313** | 100% |

**B proposals drafted: 0.**

## Why B is empty (key finding)

After reading all 313 explanations, no row has a deficiency fixable *solely* from its own fields without the fix being padding. The dataset is already editorially strong:

- The thinnest explanations (55–99 chars, the D set) are complete one-liners that fully answer simple factual questions (e.g. "Al-Araf identifies Salih as the prophet sent to Thamud."). Lengthening them with restated question/option text would be SEO filler, which is forbidden.
- The only row-data-only additions available (e.g. appending a verse number from `source_reference`) add no educational substance.
- Explanations that look "thin" at first glance consistently turn out to be deliberate: many explicitly distinguish distractors ("not the moon, sun, or wind"), and the longer ones carry careful scholarly caveats.

**Interpretation for the AdSense thin-content concern:** the median ~121 characters reflects *conciseness*, not deficiency. The explanations are not thin content in the low-value sense; padding them would create filler, not value.

## Worked examples

### A — concise and complete
- `a864a7ec` · Q: "What does Al-Khaliq mean?" · E: "Al-Khaliq means the Creator, as used in Surah al-Hashr." — Direct answer + source context. Nothing to add from row data.

### A — scholarly with caveats
- `f70d50f2` · Q: "According to Quran 39:68, what will happen on the Day of Judgment?" · E: "Quran 39:68 describes the trumpet being blown on the Day of Judgment, but it does not name the angel who blows it. Sunan Abi Dawud 3999 mentions a trumpet-bearer, but the narration is graded Da'if (weak) by al-Albani. It should therefore not be presented here as standalone definitive proof of an Aqeedah claim." — Exemplary: answers precisely, grades the evidence, states the epistemic limit.

### A — disputed row, explanation is fine
- `c59f77cb` (disputed) · Q: "How many Fard acts are in Ghusl?" · E: "Hanafi fiqh counts rinsing the mouth, rinsing the nose, and washing the entire body as the three obligatory ghusl acts; other schools classify the requirements differently." — The dispute concerns question framing (madhhab unspecified), not the explanation.

### B — no qualifying rows
- Near-miss `58ec3db5` · Q: "How many sacred months are there in Islam?" · E: "The Quran identifies four of the twelve months as sacred." — One might want to name the four months, but they appear nowhere in this row's fields (options are 2/3/4/5; source 9:36 as cited gives the count). Adding them would be an external fact → not B. Correctly classified D.

### C — needs external verification
- `9322e182` · Q: "How many Prophets are mentioned by name in the Quran?" · E: "The conventional list contains 25 named prophets, but the stored answer key selects 20. The selected answer cannot be endorsed as correct." — The explanation is honest; the *answer* needs external resolution.
- `fa6b14bc` · Q: "In which month did Isra and Miraj occur?" · E: "Rajab is a popularly given month for the Miraj, but its exact month has not been established here with an authentic source." — Improving this (confirming or correcting Rajab) requires an external authentic source.

### D — correctly concise, do not expand
- `58ec3db5` · Q: "How many sacred months are there in Islam?" · E: "The Quran identifies four of the twelve months as sacred." (57 chars) — Complete answer; the row's fields are exhausted; expansion would need external facts or be filler.

## C-row inventory (17)

| ID (prefix) | Issue |
|---|---|
| 9322e182 | Answer key (20) vs conventional list (25); cannot be endorsed |
| 942d1620 | Question premise unsupported (no surah mentions all 99 names) |
| 2d8b8a13, 878f699d | 2698 vs 2699 "Allah" occurrences; needs defined text/convention |
| 1e8646d1 | Minaret count "nine" not verified as current |
| 21268d41 | 40-day flood duration not established by reliable evidence |
| 09d8d668 | "Forty houses" specification not established |
| fa6b14bc, 47cebbaf | Miraj month not established with authentic source |
| 22581591 | Israfil–trumpet joining not directly checked |
| 30fecbf8, 30d473e5 | Mikail primary report unverified |
| 7ff963fe | Musa most-mentioned count not independently confirmed |
| f4f1cb3c, bf41f99d | Sajdah-verse count needs school/convention specified |
| acc3a306 | Ruku count needs edition/sectioning scheme specified |
| cc209308 | "Greatest jihad" claim not established with reliable evidence |

## Notes and limits

- No invented content, citations, scholar names, or religious claims were added at any point. B proposals were drafted for zero rows because zero rows qualified.
- Disputed/needs-review rows (32) were classified on explanation merit; where the explanation is careful and complete they are A, with the dispute noted as concerning question framing.
- Bengali explanations were spot-checked for parity; no deficient BN rows found.
- This triage does not change any rendered content. Any future B work would require re-finding genuine B cases under the same strict rule.
