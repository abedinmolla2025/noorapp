# Surah introductions research — Surahs 1–57

Date: 2026-09-28. Evidence-first, read-only research. No content invented.

## Status counts

| overall | count |
|---|---|
| VERIFIED | 56 |
| CONFLICTING | 1 |
| PARTIALLY_VERIFIED | 0 |
| UNVERIFIED | 0 |

- **57 of 57 surahs have an English draft** built exclusively from VERIFIED claims
  (name meaning + revelation type + verse count; surah 55's draft omits revelation type).
- **Zero claims were invented.** Every claim carries 2–4 sourced excerpts.

## Sources used

1. **Quran.com Chapters API** (QUL / Quran.com) — `revelation_place`, `verses_count`,
   `translated_name` for all 114 chapters. Repository tier.
   `https://api.quran.com/api/v4/chapters?language=en`
2. **Tanzil Quran Metadata** (`quran-data.js`, ver 1.0, CC-BY 3.0) — per-surah
   `[start, ayas, order, rukus, name, tname, ename, type]` including `Meccan`/`Medinan`.
   Independent compilation from the Tanzil Project. Repository tier.
   `https://tanzil.net/res/text/metadata/quran-data.js`
3. **QuranEnc Surah Index** (Noor International Center / Encyclopedia of the Noble Quran) —
   verse counts for all 114 surahs, cross-checked 1–57. Repository tier.
   `https://quranenc.com/en/browse/english_saheeh`
4. **noorapp repo data** (`src/data/quran_surahs.json`) — existing published metadata, used as
   a consistency check (its English names match Tanzil's `ename` exactly for all 57).
5. **Quranic Arabic Corpus** (University of Leeds) — chapter header `(The Opening)` used as a
   third source for surah 1's name meaning only.
   `https://corpus.quran.com/translation.jsp?chapter=1&verse=1`

## Cross-check results

- **Verse counts**: Quran.com API = Tanzil = QuranEnc = repo data for all 57. No conflicts.
- **Revelation type**: Quran.com API = Tanzil = repo data for all 57.
- **Name meanings**: repo = Tanzil exactly for all 57; Quran.com differs stylistically on 18
  (e.g. "The Opener" vs "The Opening", "The Table Spread" vs "The Table", transliteration
  variants like "Jonah"/"Jonas", "Ta-Ha"/"Taa-Haa"). No substantive conflicts; drafts use the
  repo rendering already displayed on the live site.

## Notable conflict

- **Surah 55 (Ar-Rahman) — revelation type CONFLICTING.** Quran.com API and Tanzil both say
  Medinan, but reputable references document an active difference of opinion: Wikipedia notes
  disagreement (Nöldeke/Ernst: early Meccan; Abdel Haleem: Medinan; most Muslim scholars: Meccan);
  Wikishia states "disagreements about whether this sura is Makki or Madani"; an academic survey
  (HYPOTHESIS vol.4/2025, citing Fahd Bin Abdurrahman Ar-Rumi) lists Ar-Rahman among 12 disputed
  surahs. The type claim is excluded from the draft and escalated; name meaning and verse count
  remain VERIFIED.
- **Surahs 1 and 13** appear in the same 12-surah disputed list as a minority view, but all
  standard references checked agree (Makki / Madani respectively); marked VERIFIED with the
  minority view noted in the record.

## Deliberately not attempted

- **Major themes**: would require two independent reputable scholarly sources per surah;
  not attempted in this batch — drafts stay strictly factual.
- **Name etymology beyond the standard English rendering**: not attempted.
- **Bengali/Urdu drafts**: translation needs separate verification; ENGLISH ONLY per task.

## Files

- `research/surah_intros_001_057.json` — 57 records, full claim→source evidence trail.
- `research/surah_intros_001_057.md` — this summary.
