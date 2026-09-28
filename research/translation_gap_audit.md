# Translation / Attribution Gap Audit — 2026-09-28

## Scope
Bengali/Urdu translation metadata and translator attribution across the
evidence-first remediation surface.

## Findings

1. **95 published surah introductions: English only.** No Bengali or Urdu
   translation of the intro prose has been published. No verified translation
   evidence exists for these texts. Per policy (no invented translations),
   they remain English-only until separately verified translation evidence
   is available.

2. **Ayah-level Bengali translation attribution (pre-existing, unchanged).**
   Surah pages attribute Bengali translation to Muhiuddin Khan via the
   AlQuran Cloud API in both SPA and bot HTML. This attribution predates the
   remediation and was verified, not manufactured.

3. **Quiz Bengali content (pre-existing data, unchanged).** Some quiz rows
   carry `question_bn` from the source dataset. Draft Bengali translations
   in `research/quiz_c_proposals.sql` are marked REVIEW-TRANSLATION and are
   explicitly unverified — they were NOT applied and must not be published
   without separate verified translation evidence.

4. **Hadith translations (pre-existing, unchanged).** `/hadith/h/:slug`
   pages carry a translator disclaimer added in the 2026-09-27 remediation.

## Gap statement
There is no verified Bengali/Urdu translator or translation source for:
- the 95 published surah introductions,
- any proposed quiz question/answer corrections,
- any hadith chapter introductions (none published).

These remain unpublished/unattributed. Manufacturing attribution would
violate the no-invention policy. Closing this gap requires either (a) a
verified translator/source for the intro prose, or (b) a human editorial
decision to commission translations.

## Recommendation
Leave as-is. Do not attribute, do not translate, do not guess.

## Phase 7 investigation update (2026-09-28)

Searched repo source (src/, api/) and API metadata for translator attribution:

1. **Quran ayah translations — VERIFIED, already attributed.** Bengali:
   Muhiuddin Khan; English: Saheeh International; Urdu: Ahmed Ali; all
   served via the AlQuran Cloud API. Attributed in DataSourcesPage.tsx,
   api/prerender.js (bot HTML), and src/hooks/useQuranData.ts. No change
   needed.

2. **Hadith English translations — UNRESOLVED.** The bundled Sahih Bukhari
   JSONs carry English translation text but no translator/edition metadata
   exists in the repo. The standard attribution is not documented in-repo;
   inventing one is forbidden. Left unattributed; flagged as a metadata gap.

3. **Dua translations — UNRESOLVED.** DuaPage.tsx points users to /sources
   for methodology; per-record `reference` fields carry collection/verse
   citations, but no translator attribution exists in repo metadata.

4. **Surah introductions — N/A.** The 104 published intros are English-only
   original prose; no translation exists to attribute.

No invented attribution was added. Gaps 2–3 require source-dataset
documentation the repo does not currently hold.
