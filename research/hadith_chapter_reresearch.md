# Hadith Chapter Re-research — Final Report (2026-09-28)

Second evidence-first research pass over all 97 Sahih al-Bukhari chapter pages, authorized 2026-09-28.
Seven parallel research workers covered chapters 1–12, 13–25, 26–40, 41–55, 56–70, 71–84, 85–97;
the coordinator cross-checked every record, re-attributed evidence by actual hadith content,
corrected worker misclassifications, and validated the final set.

## 🚨 Critical finding: 84 of 97 chapter TITLES do not match their content

Verified against the repo's own data (`public/data/sahih_bukhari_en.json` hadith texts +
`SCHOLAR-REVIEW-211.csv` Supabase titles, 2026-09-28):

- The hadith data follows the standard Khan-numbered 97-book order of Sahih al-Bukhari
  (book_N = standard book N; confirmed via hadith numbers and first-hadith texts for all 97).
- The app's `hadith_chapters` titles are correct for only **13 chapters**:
  1–9 (Revelation…Prayer Times), 14 (Witr Prayer), 17 (Prostration), 25 (Hajj), 26 (Umrah).
- The other **84 titles are wrong** — real Bukhari book names assigned to the wrong numbers.
  Examples live on the site right now:
  - chapter-76 titled "Interpretation of Dreams" shows **Medicine** hadiths
  - chapter-78 titled "Medicine" shows **Manners** hadiths
  - chapter-48 titled "Medicine" shows **Mortgage** hadiths
  - chapter-64 titled "Agriculture" shows **Military Expeditions** hadiths
  - chapter-68 titled "Unjust Gains" shows **Divorce** hadiths
  - chapter-12 titled "Shortening Prayer" shows **Fear Prayer** hadiths
  - chapter-19 titled "Imam" shows **Tahajjud (Night Prayer)** hadiths
  - chapter-23 titled "Zakat" shows **Funerals** hadiths
  - chapter-24 titled "Fasting" shows **Zakat** hadiths
  - chapter-30 titled "Loans" shows **Fasting** hadiths

**Consequence:** NO introduction may be published until the titles are corrected —
even the content-correct drafts below would sit under false titles (except ch 1–3, 14, 25).
Recommended fix (parent/human decision, needs privileged DB access — an explicit stop
condition): rewrite `title`/`title_bn`/`title_ar` in `hadith_chapters` from the standard
book list. Every record below therefore carries `app_title`, `actual_book`, and
`title_matches_content`, and is keyed to **actual hadith content**, not app titles.

## Class counts (97 chapters)

| Class | Count | Meaning |
|---|---|---|
| A | 16 | ≥2 strong independent sources; draft written (content-correct) |
| B | 23 | one credible source only; needs one more independent source |
| C | 0 | no genuine source conflicts survived cross-check |
| D | 58 | insufficient evidence after 2–4 source-type angles each |

## Class-A chapters and drafts

> ⚠️ Only drafts 1–3, 14, 25 sit under correct app titles. All other drafts describe the
> chapter's ACTUAL content — publish only after the title fix.

**1 — Revelation (title correct).** "Sahih al-Bukhari opens with the Book of Revelation
because revelation is the source of all matters of religion, placed before faith,
knowledge, and every other book. It begins with the hadith of intentions — reminding
compiler and reader that deeds are judged by intention."
Sources: Qari Muhammad Tayyib (1977 Khatm-e-Bukhari lecture); Mahmud Hasan Deobandi,
*Al-Abwab wa al-Tarajim* pp.16–17; Yasir Qadhi/AlMaghrib notes; islaam.net (Nawawi
40-hadith commentary: intentions hadith = Bukhari #1).

**2 — Belief (title correct).** "The Book of Belief follows Revelation because faith is
the foundation on which all actions are built — no deed is valid without it. The book
establishes that iman combines inward affirmation with outward speech and actions,
presenting the position of Ahl al-Sunnah on the nature of faith."
Sources: Tayyib; abuaaliyah.com foreword (Ar-Rajhi/Abu Aaliyah); Qadhi/AlMaghrib.

**3 — Knowledge (title correct).** "The Book of Knowledge comes after Revelation and
Belief because knowledge must precede action: once a person has faith, they need to
learn how to fulfill its requirements. The book covers the virtue of knowledge, its
methods, and the etiquette of teaching and learning."
Sources: Qadhi/AlMaghrib; Tayyib; 'Features of Imam al-Bukhari's Educational Thought'
(academic paper; hosted on obscure CDN — provenance disclosed).

**14 — Witr (title correct).** "Bukhari devotes a distinct book to the Witr prayer,
giving it headings of its own rather than subsuming it under the chapters on Tahajjud
and voluntary prayer. The book sets out the rulings of Witr."
Sources: Ibn Hajar, *Fath al-Bari*; al-'Ayni, *'Umdat al-Qari*.

**19 — actual: Tahajjud / Night Prayer (app title "Imam" — WRONG).**
"Bukhari's Book of Tahajjud gathers the reports on night prayer; his aim is to
establish the legitimacy of night prayer without addressing its legal ruling."
Sources: *Fath al-Bari*; *'Umdat al-Qari*.

**23 — actual: Funerals (app title "Zakat" — WRONG).**
"Bukhari's Book of Funerals (Janaza) sets out the rulings of funerals — a prayer with
no bowing or prostration — placed after the prayer chapters and before the Book of Zakat."
Sources: *Fath al-Bari*; *'Umdat al-Qari* (two complementary claims, both verified).

**24 — actual: Zakat (app title "Fasting" — WRONG).**
"Bukhari's Book of Zakat sets out the rulings of Zakat, the third pillar of Islam."
Sources: *Fath al-Bari*; *'Umdat al-Qari*. (Claim trimmed: the Fath excerpt is
truncated mid-sentence, so "agreed-upon and disputed evidences" was excluded.)

**25 — Hajj (title correct).** "Bukhari devotes the Book of Hajj to explaining Hajj —
purposeful intent in language, and in law the journey to the Sacred House with
specific rites. He places it after the Book of Zakat and before the Book of Fasting."
Sources: *Fath al-Bari*; *'Umdat al-Qari*.

**30 — actual: Fasting (app title "Loans" — WRONG).**
"Bukhari's Book of Fasting sets out the rulings of fasting."
Sources: *Fath al-Bari*; *'Umdat al-Qari*. (Claim trimmed: both excerpts truncated;
arrangement details excluded.)

**59 — actual: Beginning of Creation (app title "Witnesses" — WRONG).**
"Kitab Bad' al-Khalq — 'The Beginning of Creation' — is the book on the origination
of creation: that is, the created beings."
Sources: *Fath al-Bari*; *'Umdat al-Qari*.

**64 — actual: Military Expeditions (app title "Agriculture" — WRONG).**
"Kitab al-Maghazi is the book of the Prophet's military expeditions… Bukhari does not
separate maghazi from saraya (the smaller expeditions he dispatched): he includes the
saraya and the bu'uth (dispatches) in this book as well." (Full text in JSON.)
Sources: *Fath al-Bari*; *'Umdat al-Qari*; al-Kandhlawi, *al-Abwab wa al-Tarajim*.

**68 — actual: Divorce (app title "Unjust Gains" — WRONG).**
"The Book of Divorce extends beyond the act of terminating a marriage to related
questions of waiting periods and other connected consequences of separation."
Sources: Scott C. Lucas, 'Divorce, Hadith-Scholar Style' (academic, OUP journal);
Ibn Hajar, *Fath al-Bari* (khatima of Kitab al-Talaq).

**76 — actual: Medicine (app title "Interpretation of Dreams" — WRONG).**
"Bukhari's Book of Medicine (Kitab al-Tibb) gathers hadiths on the treatment of
illness, including methods of treatment."
Sources: Deuraseh (2006), JISHIM 5(9); Rusni & Thuraya (2023), *Global Journal
Al-Thaqafah* (two independent academic papers; convergent find by two workers).

**78 — actual: Manners (app title "Medicine" — WRONG).**
"Bukhari's Book of Manners (Kitab al-Adab) collects hadiths on manners and morals
(adab and akhlaq)."
Sources: Qadhi/AlMaghrib notes; Shaykh Khalid al-'Akk's introduction (via Alukah) —
an intro to a different work (*Sahih al-Adab al-Mufrad*) whose excerpt describes the
Jami' al-Sahih's adab material; medium-strength, disclosed.

**80 — actual: Invocations (app title "Adornment" — WRONG).**
"Bukhari's Book of Supplications (Kitab al-Da'awat) gathers hadiths on supplication
(du'a): the servant's asking of his Lord."
Sources: Alukah/Dar Ibn al-Jawzi notice (Dr. Mahir Yasin al-Fahl's commentary);
Ibn Baz lesson transcript (via Baheth). Both excerpts captured from search-result
renderings (pages timed out) — disclosed.

**82 — actual: Divine Decree (app title "Greetings" — WRONG).**
"Bukhari's Book of Divine Decree (Kitab al-Qadar) collects hadiths on predestination,
conveying that human life is preordained in all its detail."
Sources: MA thesis, Emir Abdelkader University (via archive.org); IIUM/NEUSEAL
catalog record of a second academic work on the predestination chapter.

## Class-B chapters (one credible source; one more independent source needed)

| Ch | Actual book | Source on file | Title OK? |
|---|---|---|---|
| 13 | Two Festivals | *Fath al-Bari* (arrangement) | No ("Supererogatory Prayer") |
| 15 | Rain Prayer | *Fath al-Bari* (arrangement) | No ("Night Prayer") |
| 16 | Eclipses | *Fath al-Bari* (arrangement) | No ("Prayer in General") |
| 17 | Prostration in Recitation | *Fath al-Bari* (arrangement) | Yes ("Prostration") |
| 18 | Shortening Prayer | *Fath al-Bari* + Qadhi/AlMaghrib (merged) | No ("Recitation in Prayer") |
| 20 | Virtue of prayer in Makkah/Madinah | *Fath al-Bari* (book opening) | No ("Congregation" — imprecise) |
| 21 | Actions during Prayer | *Fath al-Bari* (arrangement) | No ("Iqama") |
| 22 | Forgetfulness in Prayer | *Fath al-Bari* (arrangement) | No ("Funerals") |
| 26 | 'Umrah | *Fath al-Bari* | Yes |
| 34 | Sales | *Fath al-Bari* Buyu' opening | No |
| 41 | Cultivation | *Fath al-Bari* Muzara'a conclusion | No |
| 43 | Loans/Repayment | Al-Basirah/UM academic paper | No |
| 46 | Wrongful Acts | Öztürk (2021), Şırnak Univ. journal | No |
| 49 | Manumission | *Fath al-Bari* 'Itq conclusion | No |
| 51 | Gifts | *Fath al-Bari* Hibah opening+conclusion (shared provenance — still one work) | No |
| 52 | Witnesses | *Fath al-Bari* Shahadat conclusion | No |
| 55 | Wills | *Fath al-Bari* Wasaya definition | No |
| 60 | Prophets | *Fath al-Bari* Anbiya' title gloss | No |
| 63 | Virtues of the Ansar | *Fath al-Bari* Manaqib al-Ansar opening | No |
| 65 | Virtues of the Qur'an | Ibn Kathir (via lesson transcript) | No |
| 81 | Heart-softening | Emir Abdelkader Univ. thesis | No |
| 85 | Inheritance | *Fath al-Bari* Fara'id definition | No |
| 92 | Tribulations | *Islāmiyyāt* 48(1) (2nd source was a weak venue — downgraded from A) | No ("Losses") |

## What changed vs the first pass

- First pass: 90 UNVERIFIED + 7 PARTIALLY_VERIFIED, 0 drafts — and it researched by
  **app title**, which is wrong for 84 chapters.
- This pass: **A 16 / B 23 / C 0 / D 58**, with 16 drafts — every finding re-attributed
  to **actual hadith content**. 20+ records were re-homed (Tibb ch 48→76; Maghazi
  ch 40→64; Talaq ch 85→68; Taqsir ch 12→18; Buyu' ch 27/28→34; Hibah ch 32/87→51;
  Wasaya ch 33→55; Fara'id ch 34→85; Anbiya' ch 37→60; Fada'il al-Qur'an ch 38→65;
  Manaqib al-Ansar ch 39→63; Mazalim ch 68→46; Istiqrad ch 70→43; 'Itq ch 88→49;
  Shahadat ch 89→52; Muzara'a ch 95→41; Bad' al-Khalq ch 36→59; Tahajjud/Funerals/
  Zakat/Fasting evidence re-homed to ch 19/23/24/30).
- Chapters whose titles ARE correct (1–9, 14, 17, 25, 26) kept their research in place.

## Coordinator corrections to worker output (all documented in record notes)

1. **Group B worker's title assertions were wrong** for ch 13/15/16/20/21: it claimed
   the content "matched the custom label," but the authoritative Supabase titles are
   'Supererogatory Prayer', 'Night Prayer', 'Prayer in General', 'Congregation',
   'Iqama' — none matches. Corrected; TITLE_WARN applied.
2. **Group B worker's class C (ch 19/22/23/24) was re-graded**: the "conflict" was
   label-vs-content, not conflicting scholarly sources (the sources agree). Re-homed
   and re-graded on source strength → ch 19/23/24 are A, ch 22 is B. No genuine C remains.
3. **Chapter 92 downgraded A→B**: its second source is a paper in the Journal of
   Positive School Psychology — a psychology-education venue publishing unrelated
   material, not a strong Islamic-studies source. The Islāmiyyāt (UKM) paper alone
   remains the strong source.
4. **Chapter 1 upgraded to A**: coordinator found a second independent source
   (islaam.net Nawawi commentary: intentions hadith = Bukhari #1); draft trimmed of
   the single-source clause.
5. **Shared provenance disclosed, not double-counted**: all Hibah excerpts come from
   Ibn Hajar's *Fath al-Bari* (one work) → ch 51 stays B; the 2022 IJSSIR abstract
   copying Deuraseh 2006 excluded; duplicate Fath citations merged.
6. **Truncated excerpts**: ch 24 and ch 30 drafts use only the fully-supported wording;
   arrangement details from cut-off excerpts were excluded.

## Prior partials: upgraded or not

| Prior single source | Result |
|---|---|
| Ch 1–3 (Qadhi notes) | ✅ Upgraded to A (Tayyib + Mahmud Hasan / abuaaliyah / academic paper added) |
| Ch 12 (Qadhi, shortening) | Re-homed to ch 18 as B (ch 12's content is Fear Prayer) |
| Ch 70 debt paper | Re-homed to ch 43 as B (ch 70's content is Food) |
| Ch 74 Adab handout | Re-homed to ch 78, now A with al-'Akk as 2nd source |
| Ch 78 Tibb (Deuraseh) | Re-homed to ch 76, now A with Rusni & Thuraya as 2nd source |

## Method and exclusions

Public web only (browser_search/browser_open) plus local repo inspection. Excluded
throughout: Wikipedia/Wikishia, Al-Islam.org auto-generated pages, SEO/AI-generated
pages (notably v2.scriptsure.org "overviews" and flyriver spam), unattributed hadith
mirrors, fiqh-ruling articles, hadith text presented as commentary, polemical sites
(answeringislam.net etc.), and near-identical copied abstracts. Nothing invented;
every cited source carries a verbatim excerpt in the JSON. Each worker tried 2–4
independent source-type angles per chapter before grading D.

## Deliverables

- `research/hadith_chapter_reresearch.json` — 97 records (chapter_number, claims[] with
  status + sources[name/url/type/exact excerpt], draft_en, class, notes; plus app_title,
  actual_book, title_matches_content for the mismatch audit)
- `research/hadith_chapter_reresearch.md` — this report

No app code, data, DB, or deployment was modified. No AdSense action taken.
**Nothing is published**: all 16 drafts are content-correct but 11 of them sit under
wrong app titles; the title fix (privileged DB access) must come first.
