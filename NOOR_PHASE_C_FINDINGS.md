# PHASE C — SOURCE & CONTENT INTEGRITY FINDINGS

Date: 2026-09-27. All claims below were verified against live data/APIs on this date.

## C1. QURAN

### Translation attribution — FIXED (was missing, now evidence-based)
The app fetches Quran text from the AlQuran Cloud API using fixed edition
identifiers (`src/hooks/useQuranData.ts` EDITIONS map). Translator identity
was verified 2026-09-27 against the source API's own edition metadata
(`https://api.alquran.cloud/v1/edition/language/<lang>`):

| Edition ID    | Translator (per source API)              |
|---------------|------------------------------------------|
| bn.bengali    | Muhiuddin Khan                           |
| en.sahih       | Saheeh International                     |
| ur.ahmedali   | Ahmed Ali                                |
| hi.hindi      | Suhel Farooq Khan and Saifur Rahman Nadwi|
| id.indonesian | (source API names no translator)         |
| ar.alafasy    | Mishary Rashid Alafasy (recitation)      |

Changes:
- `src/hooks/useQuranData.ts`: added exported `TRANSLATION_ATTRIBUTION`
  and `QURAN_SOURCE_NOTE` with the verified mapping. Indonesian is honestly
  recorded as "Translator not named by the source API" — no name invented.
- `src/components/SurahReader.tsx`: language selector now shows a live
  attribution line, e.g. "Bengali translation: Muhiuddin Khan · via AlQuran Cloud API".
- `src/pages/DataSourcesPage.tsx` + `api/prerender.js` (/sources copy):
  the old claim "English translation: Sahih International and Yusuf Ali
  (public domain)" was WRONG — the app never used Yusuf Ali. Corrected to
  the verified API-served translators.

### Makki/Madani metadata
`revelationType` (Meccan/Medenian) exists in the surah data and IS rendered
on the Quran hub (`QuranPage.tsx` shows মক্কী/মাদানী badges). No fix needed.

### Bismillah
`SurahReader.tsx` renders Bismillah at the top for all surahs EXCEPT 1
(Al-Fatiha, where it is verse 1) and 9 (At-Tawbah, no Bismillah). Correct
Islamic handling. Bengali translation shown for Bengali mode. No fix needed.

### Surah introductions
No surah introduction/context field exists in the data; none is claimed.
Evidence gap noted, not fabricated.

## C2. HADITH

Live inventory: only Sahih al-Bukhari. 7,220 rows in `hadiths`, ALL with
Bengali, ZERO with English/Urdu in Supabase. English/Urdu exist only as
bundled JSON (`public/data/sahih_bukhari_en.json`, `sahih_bukhari_ur.json`)
used by `BukhariLangPage`.

### Bangla attribution — FIXED (evidence-based)
199/200 sampled Bengali texts end with an embedded cross-reference of the
form `(৬২৪) (আধুনিক প্রকাশনীঃ ৫৯১, ইসলামিক ফাউন্ডেশনঃ)` — i.e. the text
itself cites the Adhunik Prokashoni and Islamic Foundation Bangladesh
editions. `src/pages/hadith/HadithDetailPage.tsx` now shows an attribution
note stating this. No individual translator name is claimed (not verified).

### English/Urdu attribution — EVIDENCE GAP (documented, not guessed)
No translator field exists in the bundled JSON or the repo, and no
provenance script was found. Per policy, no name is asserted.
`HadithDetailPage.tsx` honestly notes that the translator is not recorded
in the source data. MANUAL VERIFICATION NEEDED before claiming any name.

### Chapter context — IMPROVED
`hadith_chapters` has verified titles (title/title_bn, e.g. ch.3 "ইলম")
but the SPA detail page showed only "অধ্যায় N". It now fetches and shows
the chapter title. No description field exists; none invented.

### Numbering / authenticity
Story-cited Bukhari numbers spot-checked: none exceed 7563; Muslim numbers
none exceed 3033. Grades follow classical scholarship per /sources.

## C3. STORIES
- 74/74 stories have a source or reference; 0 missing both.
- 69 distinct source values (not templated).
- Sanity checks: no Bukhari number > 7563, no Muslim number > 3033,
  no surah number outside 1–114.
- Sources are genuine classical references (Quran surah:verse, Sahih
  al-Bukhari/Muslim numbers, Ibn Hisham, Tafsir Ibn Kathir).
- Tafsir is cited as background in 21 stories; /sources no longer implies a
  standalone tafsir feature (reframed as "reference works consulted").

## Files changed (Phase C)
- src/hooks/useQuranData.ts
- src/components/SurahReader.tsx
- src/pages/DataSourcesPage.tsx
- src/pages/hadith/HadithDetailPage.tsx
- api/prerender.js (/sources Quran copy)

## Validation
- ESLint on changed files: identical error count to HEAD (13 = 13, zero new).
- `node --check api/prerender.js`: pass.
- Full build + prerender content re-verification: pending (runs next).
