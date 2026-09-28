# NOOR APP — FULL A→Z AI-DRIVEN CONTENT COMPLETION — FINAL REPORT (2026-09-28)

## Objective
Maximize evidence-backed content remediation with AI research; never invent;
leave unpublished what evidence cannot support.

## BEFORE → AFTER

### Surah introductions (114 total)
- Before: **95 published** (of which 31 later found to cite weak sources on ≥1 claim), 19 unpublished
- After: **104 published**, 10 unpublished
  - +9 new class-A intros: surahs 68, 91, 92, 93, 94, 95, 100, 101, 102
    (every claim ≥2 independent sources, excerpts on file)
  - 31 published intros **source-remediated**: every mechanical claim
    re-anchored to two live primary APIs (Quran.com Chapters API +
    AlQuran Cloud Surah Metadata, 100% cross-check agreement on
    revelation place + verse counts); weak sources (Wikipedia, content
    farms, unvetted mirrors) stripped from all 104 public source lists —
    zero weak sources remain
  - 9 intros honestly **theme-trimmed** to mechanical-only (name +
    classification + verse count) where theme claims had <2 strong sources
  - Surah 96 keeps its first-revelation clause, now backed by Maududi (IIUM)
    + Sahih al-Bukhari 3 (sunnah.com)
  - 10 remain unpublished: genuine Makki/Madani authority conflicts
    (55, 60, 76, 83, 97, 98, 99, 107, 112, 113) — kept unpublished per policy

### Hadith chapter introductions (97 total)
- Before: 0 published. After: **0 published** — second-attempt evidence
  research was still running at deploy time (interim: class-A candidates
  emerging, final synthesis pending). Nothing invented in the meantime.

### Quiz (313 records)
- Corrected (applied): **0** — 5 VERIFIED_CORRECT fixes are evidence-ready
  (9322e182→25 prophets; 1e8646d1→13 minarets "currently"; cc209308→Tirmidhi
  1621 rebuild; f4f1cb3c→Hanafi-qualified 14; bf41f99d→Ibn Baz/PC-qualified 15)
  with concise evidence-based explanations drafted, but all are **proposal-only**:
  quiz content lives in Supabase and writes are RLS-blocked
- Retained as-is: 4 VERIFIED_KEEP (+ Takbir pair, both educationally distinct)
- Retired (applied): **0** — 5 retirements proposed, require privileged DB
  access + human publication decision
- Unresolved: **3 CONFLICTING** (never touched per policy)
- Near-duplicates: all 6 rows resolved — 1 consolidated (Ayatul Kursi, live
  since e9cebde), 5 keep-both with documented reasons (2 blocked by the
  textual correct-answer safety invariant, which was never weakened)

### Dua (160 affected records)
- SUPPORTED: **0** (honest zero — no virtue claim verified word-for-word
  against its exact cited source)
- PARTIALLY_SUPPORTED: **108** (19 need virtue_reference 40:60→2:222; 89 are
  interpretation-level claims cited to 40:60)
- UNSUPPORTED: 0 | TEMPLATE: **52** | CONFLICTING: 0 | REQUIRES_REVIEW: 0
- Cleanup-ready: **71** (52 suppressions + 19 reference fixes) — deterministic
  migration stands proposal-only in `research/dua_cleanup_migration.sql`
- DB-updated: **0** — RLS-blocked, no writes attempted; render-layer
  suppression remains active
- Adjudication: batch agents initially mislabeled 19 rows SUPPORTED on claim
  text alone while citing the wrong verse; corrected to PARTIALLY_SUPPORTED
  (claim true per 2:222, citation was 40:60)

### Translation attribution
- Verified: **3** — Quran ayah translators (Bengali: Muhiuddin Khan; English:
  Saheeh International; Urdu: Ahmed Ali; via AlQuran Cloud API), already
  attributed in-app and in bot HTML
- Unresolved: hadith English translator, dua translation sources (no metadata
  in repo — not invented); surah intros are English-only originals (nothing to
  attribute)

### High-confidence AI changes applied (this deploy)
1. 9 new surah introductions (HIGH)
2. 31 surah source remediations + weak-source strip across all 104 (HIGH)
3. Source-transparency presentation: primary/secondary badges + "Source-verified
   research · Not reviewed by a scholar" caption in SPA + bot HTML (HIGH —
   presentation only, never claims scholar review)

## Validation (Phase 14)
- `npm run build`: PASS · `npx tsc --noEmit`: clean
- `node scripts/quality-gates.mjs`: **ALL PASS** (12/12, incl. 31/31 quiz
  canonicals)
- Targeted prerender: /quran/104 (trimmed intro, badges, caption, no weak
  sources), /quran/96 (Bukhari-backed clause), /quran/68 (new intro),
  /quran/60 (class C — correctly no intro): all PASS

## Production
- Commit: **7e219ae** (3dbb9ef..7e219ae pushed to origin/main)
- Vercel: **dpl_BFjXeJ1DaFyixesJfw35hZ9h4Ehj READY** on noorappold
- Production verified live: /quran/68 (new intro + badges + caption),
  /quran/104 (remediated intro, no weak sources), /quran/60 (class C —
  correctly no intro)
- noorapp-ucmi untouched · no DNS/domain/env/AdSense changes · no AdSense
  review submitted

## Remaining unresolved (need human moves, not more AI effort)
1. 97 hadith chapter intros — research in flight; publish only class-A
2. 10 class-C surah intros — genuine scholarly conflicts
3. Quiz: 14 proposal-ready corrections/retirements — need privileged DB access;
   3 conflicting — need human judgment
4. Dua: 71 cleanup-ready rows — need privileged DB access
5. Translation metadata gaps — need source-dataset documentation

## Final verdict: **NOT YET READY** for AdSense review
Material progress: 104/114 surah intros now meet the strong-source bar (up
from 95 with 31 weak-sourced), full dua evidence map, quiz correction packets
with explanations. Blockers unchanged in kind: privileged DB access (quiz +
dua), scholar-level source conflicts (10 surahs, 3 quiz), hadith chapter
research incomplete. No approval claimed or guaranteed.

---

## Follow-up addendum — hadith chapter introductions (2026-09-28, 16:30 IST)

### Hadith chapter re-research: complete
- Coordinator delivered `research/hadith_chapter_reresearch.json` + `.md`:
  97 chapters classified A=16 / B=23 / C=0 / D=58.
- **Critical finding: 84/97 `hadith_chapters` DB titles do not match the
  actual bundled hadith content** (titles appear shifted; only chapters
  1–9, 14, 17, 25, 26 match). Title correction needs privileged DB access —
  no write was made.

### Independent source verification: 5 chapters publishable
Of the 16 class-A drafts, only chapters **1, 2, 3, 14, 25** have app titles
that match their actual hadith content. Every published claim in these five
drafts was independently verified verbatim against 2+ reputable sources:
- **Fath al-Bari** (Ibn Hajar) + **Umdat al-Qari** (al-Ayni) — classical
  rival commentaries, verified via IslamWeb and Shamela (chapters 14, 25)
- **Qari Muhammad Tayyib** 1977 Khatm-e-Bukhari lecture (English translation),
  verified verbatim via Scribd (chapters 1, 2, 3)
- **Mahmud Hasan Deobandi**, Al-Abwab wa al-Tarajim (ch. 1)
- **Abdul Aziz al-Rajhi** Book of Faith foreword (ch. 1, 2)
- **Yasir Qadhi / AlMaghrib** 2012 Sahih intro notes (ch. 1, 2, 3)
The remaining 11 class-A drafts (19, 23, 24, 30, 59, 64, 68, 76, 78, 80,
82) stay **unpublished** — their DB titles do not match their content, so
publishing would mislabel the page (e.g. a Military Expeditions intro under
an "Agriculture" title). The 23 class-B drafts need another independent
source; 58 class-D drafts stay unpublished.

### Implementation
- New `src/data/hadith-chapter-intros.json` (5 chapters), copied with
  fail-closed validation by `scripts/extract-tool-data.mjs`
- Rendered in `BukhariLangPage.tsx` SPA chapter view and `api/prerender.js`
  bot HTML with source attribution + "Source-verified research · Not
  reviewed by a scholar" — unverified chapters render nothing, no placeholders
- `vercel.json` includeFiles extended (string form preserved)

### Validation & deployment
- Build PASS · tsc 0 errors · quality-gates ALL PASS (12/12)
- 8/8 targeted prerender assertions: intros on chapters 1/2/3/14/25 (en+bn),
  no intro on 19 (mismatch) and 4 (unverified), no class-A draft leakage
- Commit `9657bc1` pushed (7997235..9657bc1) to origin/main
- Vercel deployment `dpl_BN8CdfASgrZwwzeon4TmbKxjVC6U` READY on **noorappold**
  only; noorapp-ucmi untouched
- Production verified live: intros on
  /hadith/sahih-bukhari/english/chapter-1|25 and /bangla/chapter-1,
  correctly absent on chapter-19; /quran/68 intact

### Verdict remains **NOT YET READY** for AdSense review
Blockers: privileged DB access (hadith title corrections, quiz, dua),
10 surah + 3 quiz source conflicts. No AdSense review submitted, no approval
claimed or guaranteed.
