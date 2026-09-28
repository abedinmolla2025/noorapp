# Quiz C-Records — Evidence-First Research Verdicts (2026-09-28)

17 disputed records researched independently against primary/authoritative sources.
Full evidence trail: `quiz_c_records.json`. Deterministic SQL proposals (VERIFIED
fixes only, never executed): `quiz_c_proposals.sql`.

**No Islamic content was invented. Nothing was published. No database writes.**

## Recommendation counts

| Recommendation | Count | Records |
|---|---|---|
| KEEP | 1 | `7ff963fe` |
| CORRECT | 2 | `9322e182`, `1e8646d1` |
| RETIRE | 4 | `fa6b14bc`, `47cebbaf`, `21268d41`, `09d8d668` |
| REWRITE | 4 | `cc209308`, `942d1620` (verified replacements ready), `f4f1cb3c`, `bf41f99d` (school choice needed) |
| NEEDS_MORE_EVIDENCE | 6 | `2d8b8a13`, `878f699d`, `22581591`, `30fecbf8`, `30d473e5`, `acc3a306` |

## Per-record verdicts

### KEEP (key already correct, now verified)
- **`7ff963fe`** — "Which prophet is mentioned the most in the Quran?" Key Musa (AS) is **correct and VERIFIED**: Quranic Arabic Corpus proper-noun lemma counts — Musa 136 > Ibrahim 69 > Isa 25 > Muhammad 4 (+ Ahmad 1); Oxford Bibliographies independently confirms Moses is named more than any other figure. No change needed.

### CORRECT (answer key wrong — verified fix in `quiz_c_proposals.sql`)
- **`9322e182`** — "How many Prophets are mentioned by name in the Quran?" Key `20` is wrong; **25 is VERIFIED** (islamqa.info Q10468 with full 25-name list; Ulum Al-Azhar Academy: 18 in 6:83-86 + Adam 3:33, Hud 11:50, Salih 11:61, Shu'ayb 11:84, Idris & Dhul-Kifl 21:85, Muhammad 48:29). Fix: `correct_answer` 0 → 1, explanation updated. BN explanation is a draft translation — native review required.
- **`1e8646d1`** — "How many minarets does Masjid al-Haram have?" Key `9` is outdated; **13 is VERIFIED** current (Saudi Press Agency 24 Mar 2025 citing the General Presidency; Saudipedia). Nine was the genuine count after King Fahd's 1988 expansion (IIUM academic journal) — hence the fix rewords the question to "currently have?" and changes the key to index 3 (`13`).

### RETIRE (no verifiable answer exists)
- **`fa6b14bc` / `47cebbaf`** (duplicate pair, researched once) — Isra/Miraj month. **No authentic hadith dates the event to Rajab or any month** (IslamQA fatwa 60288 quoting Ibn Baz; Mufti Taqi Usmani citing al-Zurqani's five/six classical opinions). Rajab's popularity does not make it verifiable. Retire both.
- **`21268d41`** — "How long did Prophet Nuh's flood last?" **The Quran (11:40-44) states no duration**; Ibn Kathir's only duration-like figures are Israelite reports his own method rejects; 29:14's 950 years is pre-flood time. The "40 days" figure matches the Biblical Genesis account, not any Islamic source. Retire.
- **`09d8d668`** — "Up to how many neighbors...?" The forty-house report is **da'eef per al-Albani** ("everything narrated suggesting the Prophet defined it as forty is da'eef and is not saheeh"); the authentic wording belongs to al-Hasan al-Basri (Adab al-Mufrad 109), not the Prophet. Retire.

### REWRITE
- **`cc209308`** — "What is the greatest Jihad?" The superlative has no authentic basis (the "greater jihad" report is weak per al-Bayhaqi / fabricated per Ibn Hajar's tracing to Ibrahim ibn Abi 'Ablah). **Verified replacement ready** (in SQL): "According to Jami' at-Tirmidhi 1621, the mujahid is the one who strives against ___?" — Tirmidhi 1621 is Hasan Sahih (at-Tirmidhi, al-Hakim, al-Albani; Ibn Taymiyyah: isnad jayyid).
- **`942d1620`** — "Which Surah mentions 99 names of Allah?" Premise is **false**: 59:22-24 contain only ~15 distinct names (verified from quran.com API); Bukhari 2736 states the 99 names without listing any. **Verified replacement ready** (in SQL): "The closing verses of which surah mention several of Allah's names, such as Al-Malik and Al-Quddus?" (Al-Hashr; explanation explicitly corrects the false premise).
- **`f4f1cb3c` / `bf41f99d`** — Sajdah-tilawah counts 15 vs 14. **Madhhab-dependent, VERIFIED**: Hanafi = 14 (excludes the second sajdah of Surah al-Hajj, 22:77; includes Sad 38:24); Shafi'i/Ahmad/Ibn Baz = 15 (includes both Hajj sajdahs). The differentiator is **Hajj 22:77, not Sad 38:24**. The app cannot keep both 14 and 15 as correct for near-identical stems — the stem must name the madhhab, which is an **editorial decision**; no automatic fix.

### NEEDS_MORE_EVIDENCE
- **`2d8b8a13` / `878f699d`** (duplicate pair) — "How many times does the word Allah appear?" The Quranic Arabic Corpus counts **2,699** (including the 1:1 Basmala); **no option is correct**. The circulating 2,698 traces to Abdul-Baqi's tabulation omitting 1:1 and to 19-numerology literature that removes one occurrence — neither is a neutral convention. Needs a rewrite with a stated convention (e.g. "per the Quranic Arabic Corpus: 2,699"); no fix proposed.
- **`22581591`** — Israfil's duty. The only hasan report (Tirmidhi 2431) names only "the one with the horn"; the sole reputable source joining the *name* Israfil to the trumpet is IslamQA #9477's doctrinal article — **partially verified only**. Needs a graded hadith or scholar sign-off.
- **`30fecbf8` / `30d473e5`** — Mikail and rain/provision. Same situation: only IslamQA #9477 (doctrinal statement, no chain); Ibn Kathir's tafsir of 2:98 assigns no duties; Tirmidhi 3117's cloud-angel is unnamed. Also note `30fecbf8`'s option "Provision and nature" is vague/non-standard wording. Needs scholar sign-off; the pair tests the same claim and may be near-duplicates.
- **`acc3a306`** — "How many Rukus?" 540 is **verified as the traditional design goal** (20 rak'ahs × 27 Taraweeh nights, ulema of Bukhara), but **actual marker counts are disputed** (British Library cites 558; Quran Foundation's Indopak API models ruku_number up to 558) — evidence **conflicting**. Needs a primary mushaf-count source.

## Safety notes
- All Bengali strings in proposed fixes are draft translations of verified English text, marked `REVIEW-TRANSLATION` — they must be reviewed by a native Bengali speaker before any execution.
- The SQL file was **not executed**; statements are guarded on the documented BEFORE state.
- Retirement candidates (4 records) are deliberately excluded from the SQL file — changing visibility needs an editor's confirmation.
