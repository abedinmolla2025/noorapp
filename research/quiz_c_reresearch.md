# Quiz C-Record Re-Research — Independent Verification Report

**Date:** 2026-09-28
**Task:** Fresh independent evidence verification for 17 disputed Noor App quiz records (C-rows).
**Scope:** Research only. No SQL written. No app code or database modified.
**Method:** 4 parallel research workers (browser_search/browser_open). Every fact checked against live page text this session. Workers were not given option lists, so `options_valid` is `unknown_not_provided` for all records.

## Classification counts (fresh)

| Classification | Count | Records |
|---|---|---|
| VERIFIED_KEEP | 4 | `7ff963fe`, `22581591`, `30d473e5`, `30fecbf8` |
| VERIFIED_CORRECT | 5 | `9322e182`, `1e8646d1`, `cc209308`, `f4f1cb3c`, `bf41f99d` |
| VERIFIED_RETIRE | 5 | `fa6b14bc`, `47cebbaf`, `21268d41`, `09d8d668`, `942d1620` |
| CONFLICTING | 3 | `2d8b8a13`, `878f699d`, `acc3a306` |
| UNVERIFIED | 0 | — |
| **Total** | **17** | |

## Per-record findings

### `9322e182` — Prophets named in the Quran → VERIFIED_CORRECT (key → 25)
Islam Q&A (fatwa 10468) lists 25 prophets by name. Independently verified verse-by-verse: 18 in 6:83–86 + Adam (3:33), Hud (11:50), Salih (11:61), Shu'ayb (11:84), Idris & Dhul-Kifl (21:85), Muhammad (48:29) = 25. No reputable source supports 20.

### `1e8646d1` — Minarets of Masjid al-Haram → VERIFIED_CORRECT (reword "currently", key → 13)
The General Presidency's official 2025 statement (via SPA/UNA-OIC): 13 minarets, with a gate-by-gate breakdown. Saudipedia confirms 13. 9 was genuinely correct after King Fahd's 1988 expansion; the unqualified question is time-ambiguous. A dated Saudipedia FAQ claims 6 more under construction toward 19 — inconsistent with the named-gate count, not trusted.

### `7ff963fe` — Most-mentioned prophet → VERIFIED_KEEP (Musa)
Quranic Arabic Corpus ontology: Musa's name "occurs more frequently in the Quran than any other prophet or messenger" — 136 occurrences (proper-noun lemma; next highest, Ibrahim, is 69). One outlier says 140 but does not dispute Musa's primacy.

### `fa6b14bc` / `47cebbaf` — Isra'/Mi'raj month → VERIFIED_RETIRE (both)
Ibn Baz: no authentic hadith dates the event to Rajab or any month. Mufti Taqi Usmani documents 5–6 classical opinions (Rabi' al-awwal, Rabi' al-thani, Rajab, Ramadan, Shawwal, Dhul-Hijjah); per Mulla Ali al-Qari the majority view is Ramadan or Rabi' al-awwal — contradicting the keyed Rajab.

### `21268d41` — Nuh's flood duration → VERIFIED_RETIRE
Quran 11:40–44 states no duration. 29:14's 950 years is the duration of Nuh's call to his people (Ibn Kathir), not the flood. "40 days" is Biblical (Genesis 7), not Islamic. Do not re-key to "950 years" — that is a different quantity.

### `09d8d668` — Neighbor distance (40 houses) → VERIFIED_RETIRE
Al-Albani: everything narrated suggesting the Prophet defined the neighbor as forty houses is da'eef, not saheeh (Silsilat al-Da'eefah 1/446; al-Irwa' 6/100). Settled position: only the close neighbor is consensus; beyond that is custom (IslamQA #236489).
**Caveat:** Fresh research could NOT independently confirm the prior packet's claim that the forty-houses statement is authentically attributed to al-Hasan al-Basri via Al-Adab al-Mufrad 109. That attribution is UNVERIFIED — but a Tabi'i statement could not anchor a Prophetic-definition key anyway; the retire verdict stands.

### `942d1620` — Surah listing 99 names → VERIFIED_RETIRE
False premise: Bukhari 2736 states 99 names but lists none; Al-Hashr 59:22–24 contains 15 distinct names, not 99 (verified by direct count); no surah lists all 99 (the listing comes from the hadith tradition, and the Tirmidhi listing is da'eef). Optional replacement: "How many distinct names appear in 59:22–24?" → 15.

### `cc209308` — "Greatest Jihad" → VERIFIED_CORRECT (rebuild on Tirmidhi 1621)
The "lesser-to-greater jihad" report is weak/non-Prophetic (Permanent Committee citing al-Bayhaqi, al-'Iraqi, al-Minawi; Ibn Hajar traces it to a Tabi'i's saying) — so no "greatest jihad" superlative exists. Sound replacement: "Who is the true mujahid?" → "the one who strives against his own nafs in obedience to Allah" (Tirmidhi 1621, Hasan Sahih; authenticated by al-Hakim and al-Albani, as-Sahihah 549).

### `f4f1cb3c` / `bf41f99d` — Sajdah-tilawah count → VERIFIED_CORRECT (both, authority-qualified)
- `f4f1cb3c` (key 14): "According to the Hanafi school, how many verses of prostration...?" (Hanafis include Sad 38:24, exclude Hajj 22:77 — Jawahirul Fiqh; HRMARS 2024).
- `bf41f99d` (key 15): "According to Ibn Baz and the Permanent Committee, how many verses of prostration...?" (Fatwas of Ibn Baz 24/406; IslamQA #5126; Islamweb: "most preponderant opinion").
**Correction to prior packet:** 15 must NOT be framed as "the Shafi'i/Hanbali" position — the Shafi'i school holds 14 excluding Sad 38:24 (HRMARS 2024). Attribute 15 to Ibn Baz/Permanent Committee specifically.

### `22581591` — Israfil's duty → VERIFIED_KEEP (blowing the trumpet)
Upgrade from prior NEEDS_MORE_EVIDENCE. Tirmidhi 2431 (hasan) describes "the one with the horn" without naming him; Ibn Kathir's tafsir of 2:98 explicitly states "Israfil is entrusted with the job of blowing the Trumpet" — a second independent reputable source joining name and duty. Caveat honestly noted: the join is doctrinal (hadith + scholarly tafsir), not a single hadith text.

### `30fecbf8` / `30d473e5` — Mikail's duty → VERIFIED_KEEP (rain)
Upgrade from prior NEEDS_MORE_EVIDENCE: second reputable source found (IslamQA #843, naming Mikail for rain, alongside #9477). `30fecbf8`'s option "Provision and nature" is non-standard — exact fix: reword to "Rain" (or "Rain and provision"). Do not cite Tirmidhi 3117 (unnamed angel) or Ibn Kathir 2:98 (no rain duty) for this.

### `2d8b8a13` / `878f699d` — "Allah" word count → CONFLICTING
Convention-sensitive: Quranic Arabic Corpus lemma count = 2699 (counts 1:1 Basmala); Abdul-Baqi's concordance = 2698 (omits 1:1); corpus ontology concept metric = 2721; Khalifa's 2698 is 19-numerology using a nonstandard canon. No unqualified answer is unique. Reframe with an explicit convention or retire.

### `acc3a306` — Rukus → CONFLICTING
540 is the traditional South Asian Taraweeh design (20 × 27); "other authorities give 558" (British Library, Annabel Teh Gallop); the Quran Foundation API uses 1–558. No unique answer. Optional scoped replacement: "According to the traditional South Asian division..." → 540.

## Differences from the prior packet

Substantive upgrades (new evidence found):
1. **`22581591`**: NEEDS_MORE_EVIDENCE → VERIFIED_KEEP. Ibn Kathir's tafsir of 2:98 supplied the second independent reputable source.
2. **`30d473e5`**: NEEDS_MORE_EVIDENCE → VERIFIED_KEEP. IslamQA #843 supplied the second reputable source.
3. **`30fecbf8`**: NEEDS_MORE_EVIDENCE → VERIFIED_CORRECT (keep fact, fix the non-standard option wording to "Rain").
4. **`2d8b8a13` / `878f699d`**: NEEDS_MORE_EVIDENCE → CONFLICTING. The full convention landscape is now mapped (2698/2699/2721); it is not a missing-source problem.
5. **`acc3a306`**: NEEDS_MORE_EVIDENCE → CONFLICTING. The conflict is documented by the authorities themselves.

Label/scope refinements (substance aligned):
6. **`942d1620`**: prior REWRITE → VERIFIED_RETIRE (the current record is a false premise; retire + optional 15-name replacement).
7. **`cc209308`**: prior REWRITE → VERIFIED_CORRECT (same Tirmidhi 1621 replacement; taxonomy wording differs only).
8. **`f4f1cb3c` / `bf41f99d`**: prior REWRITE → VERIFIED_CORRECT (exact authority-qualified wording now supplied).

Corrections to the prior packet's evidence:
9. **Sajdah-15 attribution:** The prior packet said 15 is the Shafi'i/Ahmad position and the sole differentiator is 22:77. Fresh evidence shows the Shafi'i school holds 14 (excluding Sad 38:24). Attribute 15 to Ibn Baz and the Permanent Committee, and note the differentiator depends on the comparison (22:77 vs Hanafi-14; 38:24 vs Shafi'i-14).
10. **Al-Hasan al-Basri attribution (40 neighbors):** Could not be independently confirmed; treated as UNVERIFIED and omitted. Retire verdict unaffected.

Aligned with the prior packet (independently confirmed): `9322e182`, `1e8646d1`, `7ff963fe`, `fa6b14bc`, `47cebbaf`, `21268d41`, `09d8d668`.

## Files
- `research/quiz_c_reresearch.json` — machine-readable per-record verdicts, evidence (with exact excerpts and URLs), corrections, and prior-packet diffs.
- `research/quiz_c_reresearch.md` — this file.

## Caveats
- Option lists were not provided to the workers; full C-row completion requires checking each record's distractor options against the DB rows.
- Weak/out-of-scope worker sources were deliberately excluded from the final JSON (Bahai-Library, Submission.org, Ask-A-Muslim, DeenBack, Scribd-hosted fiqh text, dated Saudipedia FAQ) — used only where noted as convention documentation or with explicit caveats.
