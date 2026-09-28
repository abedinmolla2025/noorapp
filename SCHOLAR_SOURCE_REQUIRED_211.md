# Scholar-Sourced Introduction Requirement List — 211 Items

**Date:** 2026-09-28 · **Phase B** · **Companion to:** `SCHOLAR_SOURCE_REQUIRED_211.csv`
**Repo:** `~/workspace/noorapp` · **Site:** https://noorapp.in

## 1. Purpose

This document and its companion CSV enumerate every site item that needs a
verified, scholar-reviewed introduction before such an introduction may be
published. It is a **source-requirement tracker, not content**: it asserts no
facts about any surah or hadith chapter and contains no introductions, quotes,
interpretations, or scholar names. Nothing here is published content.

## 2. Method (read-only verification)

1. Read `INTRO_SOURCE_REQUIREMENT_MATRIX_2026-09-28.md` (Phase 6 read-only audit):
   no verified scholarly introductions exist in repo data or the checked
   Supabase schema for any surah or hadith chapter.
2. Verified the surah dataset: `src/data/quran_surahs.json` — 114 rows,
   numbers 1–114, fields `number`, `name`, `englishName`,
   `englishNameTranslation`, `numberOfAyahs`, `revelationType`.
3. Verified the hadith chapter dataset: Supabase `hadith_chapters` — 97 rows,
   chapter numbers 1–97, fields `chapter_number`, `title` (EN), `title_bn`,
   `title_ar` (frequently empty), `hadith_count`, `book_id`. Hadith-level
   fields in `public/data/sahih_bukhari_en.json` / `sahih_bukhari_ur.json`:
   `id`, `chapter_id`, `hadith_number`, `arabic`, `english`/`urdu`.
4. Verified route patterns in `api/sitemap.js`:
   - Surahs: `/quran/<number>` for 1–114.
   - Chapters: `/hadith/sahih-bukhari/<bangla|english|urdu>/chapter-<n>` for 1–97.
5. Grep confirmed zero intro/summary/overview fields anywhere in
   `src/`, `public/data/`, `api/`, `scripts/` (searches: `surah_intro`,
   `surahintro`, `surah_summary`, `chapter_intro`, `chapterintro`).

## 3. Counts

| Group | Rows | Route pattern | Language surfaces per row |
|---|---|---|---|
| Surah introductions | 114 | `/quran/<number>` | 1 (translations live at the same route) |
| Hadith chapter introductions | 97 | 3 routes per chapter (bangla / english / urdu) | 3 |
| **Total items requiring sourcing** | **211** | — | 291 hadith-chapter surfaces |

## 4. Column definitions

| Column | Meaning |
|---|---|
| `route` | Exact site route(s) for the item. Surahs: one route. Chapters: all three language routes, pipe-separated, because one scholarly introduction must later exist with bn/en/ur parity. |
| `content_needed` | Generic description of what a publishable introduction requires — a named scholarly source, visible citation, and scholar/reviewer approval. Asserts no facts about the item. |
| `source_currently_available` | Mechanical metadata fields actually verified to exist for the item (with their location). No interpretive content. |
| `missing_source` | The single missing asset: scholarly introduction text with a named source/scholar and verifiable citation. |
| `verification_status` | `UNVERIFIED` for all 211 rows — no introduction has been sourced or reviewed. |
| `publication_status` | `NOT_PUBLISHED` for all 211 rows — nothing is published and nothing may be published until verified. |

## 5. How a scholar/reviewer uses the CSV

1. **Pick a row** (one surah or one chapter) and locate a trustworthy source:
   - Surahs: an established tafsir-based summary with a named translator/author
     and clear license terms.
   - Chapters: a published Bukhari commentary (sharh) with a named author.
2. **Record the source** per row: source work, author, translator, edition,
   license — in the future intake record (a schema change, requiring explicit
   authorization). Until then, keep this CSV as the pending-work list.
3. **Review for accuracy** — the review scope is the correctness of the
   summary, not re-translation. Mark `verification_status` only when the
   source is named, the citation is checkable, and a reviewer has signed off.
4. **Produce bn/en/ur parity** for each chapter row (surah rows live at one
   route covering all translations).
5. **Do not invent anything** while filling gaps: no revelation context,
   no Makki/Madani claims beyond the existing `revelationType` metadata, no
   historical background, no reasons for revelation, no virtues, no
   interpretations, no quotations, no scholar names, no citations. If the
   source does not say it, the introduction must not say it.
6. **Render with visible attribution** distinguishing source text from
   translation from editorial summary, then re-run quality gates before any
   deploy.

## 6. What is already publishable without scholar review

Factual header lines derived directly from the verified mechanical metadata
(e.g. "Surah Al-Baqara · 286 ayahs · Medinan", "Chapter 3 · Knowledge ·
76 hadiths") and translation-attribution disclosures are direct restatements
of in-repo data and do not require scholar review. These were partially
rendered 2026-09-27 and are tracked separately — they are not part of this CSV.

## 7. Anomalies

None. All 114 surah numbers (1–114) and all 97 chapter numbers (1–97) are
present and sequential; every item has its full set of mechanical metadata
fields (`title_ar` is frequently empty on chapters — field exists, value often
absent — and this is noted in the CSV rather than treated as a blocker).
