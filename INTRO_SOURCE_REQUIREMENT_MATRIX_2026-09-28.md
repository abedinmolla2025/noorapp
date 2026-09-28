# Surah / Hadith-Chapter Introduction — Source Requirement Matrix

**Date:** 2026-09-28 · **Scope:** Phase 6, read-only audit · **Repo:** `~/workspace/noorapp`
**Rule:** no introductions are generated or published by this audit. Nothing was modified.

## 1. What exists today (verified inventory)

### Surah pages (`/quran/:surah`, 114 URLs)
Per-surah factual fields in-repo (`src/data/quran_surahs.json`, mirrored to
`public/data/quran-surahs.json` by `scripts/extract-tool-data.mjs`, 114 rows, count-guarded):
`number`, `name` (Arabic), `englishName` (transliteration), `englishNameTranslation`
(e.g. "The Opening"), `numberOfAyahs`, `revelationType` ("Meccan"/"Medinan").

Translation attribution (`src/hooks/useQuranData.ts:47-62`, verified 2026-09-27 against
AlQuran Cloud edition metadata):
- Bengali — Muhiuddin Khan
- English — Saheeh International
- Urdu — Ahmed Ali
- Hindi — Suhel Farooq Khan and Saifur Rahman Nadwi
- Indonesian — translator not named by the source API (honestly disclosed)

Quran text/translations are served at runtime from the AlQuran Cloud API
(`api.alquran.cloud`); translation text is NOT stored in the repo.

**Surah introductions: NONE.** No intro/summary/about field exists in any surah data
file, in any Supabase table (no `surahs`/`quran_surahs`/`surah_metadata` tables exist —
all probed 404), or in any component. Grep for `surah_intro|surahintro|surah_summary|
chapter_intro|chapterintro` across `src/`, `public/data/`, `api/`, `scripts/` returns
zero hits.

### Hadith chapter pages (`/hadith/sahih-bukhari/:lang/chapter-N`, 291 URLs = 97 × 3 langs)
Per-chapter factual fields (Supabase `hadith_chapters`, 97 rows, read-only verified):
`book_id`, `chapter_number`, `title` (EN), `title_bn`, `title_ar` (frequently empty),
`hadith_count`. No intro/summary/description/overview/context columns exist
(all probed — absent).

Per-hadith fields (`public/data/sahih_bukhari_en.json`, `sahih_bukhari_ur.json`,
97 `book_N` keys): `id`, `chapter_id`, `hadith_number`, `arabic`, `english` (EN file) /
Urdu text (UR file). **No translator names** in either file — the only "translator"
keyword hits are narrative mentions of Heraclius's interpreter inside hadith texts.
The BN/EN/UR translator gap is honestly disclosed on detail pages and the hub
("অনুবাদের অনুবাদকের নাম উৎস-ডেটায় সংরক্ষিত নেই"); BN numbering follows modern
publication + Islamic Foundation Bangladesh editions (stated on the hub).

**Chapter introductions: NONE.** Same zero-hit grep result as above.

## 2. Source requirement matrix

| Content | Existing evidence | Missing evidence | Action required |
|---|---|---|---|
| Surah introductions (114 items, one per surah) | Per-surah facts: Arabic name, transliteration, English name translation, ayah count, Meccan/Medinan classification (`src/data/quran_surahs.json`); translator attribution (`src/hooks/useQuranData.ts`) | Any verified summary of a surah's themes, historical context, structure, or key topics. Zero such source exists in repo or Supabase. | **Scholar review + trustworthy external source required.** Acceptable sources: established tafsir-based summaries with named translators/authors (e.g., published tafsir literature), licensed or public-domain with clear provenance. **Cannot publish** until sourced and reviewed. |
| Hadith chapter introductions (97 items, × 3 languages = 291 surfaces) | Per-chapter facts: EN/BN/AR titles, chapter number, hadith count (`hadith_chapters`); full hadith Arabic + translations (JSON files) | Any verified summary of what each chapter covers, why its hadiths are grouped, or its key themes. No column or data exists. | **Scholar review + trustworthy external source required.** Acceptable: published Bukhari commentaries (sharh) with named authors. Trilingual parity needed (bn/en/ur) — triples editorial load. **Cannot publish** until sourced and reviewed. |
| Factual header lines (mechanical, non-interpretive) | Same per-surah / per-chapter facts as above | Nothing — no new claim involved | **Already sufficient.** Lines like "Surah Al-Baqara · 286 ayahs · Medinan" or "Chapter 3 · Knowledge · 76 hadiths" are direct restatements of verified in-repo data and may be rendered without scholar review. (Badges/navigation/attribution of this kind were added 2026-09-27.) |
| Translator attribution (Quran) | Verified edition metadata (`useQuranData.ts:47-62`) | Indonesian translator name (source API does not name one) | **Already sufficient** as published with the honest "not named" disclosure. No action. |
| Translator attribution (Hadith EN/UR) | None — genuinely absent from source data | Translator names for the EN and UR Bukhari translations | **External source required** to identify the actual translators; until then keep the honest disclosure. Do not guess. |

## 3. Counts

- **Items needing scholar review before any intro can be published: 211**
  (114 surah intros + 97 hadith chapter intros).
- Hadith chapter intros would additionally need bn/en/ur parity: 291 published surfaces.
- Items publishable today from existing evidence without review: factual header lines only
  (counts, names, Meccan/Medinan badges, attribution) — already partially rendered.

## 4. What must NOT be done

1. **No generated scholar-style introductions.** An LLM-written surah/chapter summary is
   not a source and must never be published as editorial content.
2. **No invented historical claims** (revelation circumstances, dates, asbab al-nuzul,
   biographical details) without a named, verifiable source.
3. **No fabricated citations** — no tafsir names, hadith references, page numbers, or
   scholar names invented to lend authority.
4. **No unattributed paraphrase** of copyrighted tafsir/commentary presented as original.
5. **No keyword-stuffed or filler intros** written merely to lengthen thin pages —
   a missing intro is preferable to an unsupported one.
6. **No silent publishing**: any future intro must carry its source attribution visibly,
   distinguishing source text / translation / editorial summary / reviewed material.

## 5. Recommended sourcing path (for the parent agent / user)

1. Select 1–2 public-domain or permissibly licensed tafsir sources with named
   translators (surahs) and 1 named Bukhari sharh (chapters); record license terms.
2. Commission or obtain scholar review of the selected source set (scope: accuracy of
   the summaries, not re-translation).
3. Ingest summaries with per-item source attribution fields (source work, author,
   translator, edition) — schema change + privileged DB write, both requiring explicit
   authorization.
4. Render with visible attribution and re-run quality gates before deploy.

**Bottom line:** there is no verified intro source anywhere in the repo or database
for any of the 114 surahs or 97 hadith chapters. 211 items require scholar-reviewed,
externally sourced content before introductions can exist. Factual header lines
(counts, names, revelation badges, attribution) are the only intro-adjacent content
publishable from current evidence.
