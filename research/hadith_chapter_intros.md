# Sahih Bukhari Chapter Introductions — Evidence-First Research Summary

Date: 2026-09-28 (IST) · Scope: 97 chapters (`/hadith/sahih-bukhari/{english,bangla,urdu}/chapter-N`)
Output data: [hadith_chapter_intros.json](sandbox://workspace/noorapp/research/hadith_chapter_intros.json)
Method: per-chapter targeted web research by 4 parallel researchers (1–2 searches per chapter),
plus direct verification of repository page structure. Read-only; nothing published, no DB writes,
no code changes. Nothing invented.

## Status counts

| Overall status | Chapters | Notes |
|---|---|---|
| VERIFIED | **0** | No chapter reached ≥2 independent reputable sources |
| PARTIALLY_VERIFIED | **7** | Ch 1, 2, 3, 12, 70, 74, 78 — exactly one reputable source each |
| CONFLICTING | 0 | |
| UNVERIFIED | **90** | No reputable chapter-level intro prose found |

**Chapters with a VERIFIED publishable draft (`draft_en`): 0.**

## Why so few findings (honest landscape)

- **sunnah.com** (checked directly: book index, book pages, hadith pages) presents only
  book/chapter titles and hadith listings — **no editorial chapter-level introductory prose**.
- Search results for all 97 chapters returned only: hadith-text mirrors, aggregator indexes,
  templated SEO boilerplate, individual-hadith pages, topical fiqh papers (fiqh-of-a-topic ≠
  an introduction to Bukhari's chapter), and polemical/AI-generated pages — all excluded per
  the evidence tiers.
- Classical chapter commentary (e.g. Fath al-Bari) exists per chapter but is not accessible as
  verifiable per-chapter excerpts via reputable web sources; nothing was asserted from it.

## The 7 PARTIALLY_VERIFIED chapters (single source each — NOT publishable)

1. **Ch 1 (Revelation)** — AlMaghrib Institute course notes ("Qabeelat Nurayn Collectors Edition:
   An Introduction to the Sahih of Imam Al-Bukhari", Shaykh Yasir Qadhi, Jan 2012): the book
   opens with the hadith of intention; 2 claims with exact excerpts.
2. **Ch 2 (Belief)** — same source: Bukhari's position on iman/actions; 3 claims.
3. **Ch 3 (Knowledge)** — same source: why the Book of Knowledge follows Revelation and Iman;
   knowledge precedes action; 2 claims.
4. **Ch 12 (Shortening Prayer)** — same source: the two fiqh issues the book addresses
   (duration of shortening; minimum travel distance); 3 claims.
5. **Ch 70 (Debt)** — *Al-Qanatir: International Journal of Islamic Studies* (2018, UTM/UM
   authors): study of Kitab al-Istiqrad wa Ada' al-Duyun and Ibn al-Munayyir's analysis of its
   chapter headings; 1 claim, abstract excerpt verified live.
6. **Ch 74 (Manners)** — AlMaghrib course notes (verified live 2026-09-28): Kitab al-Adab scopes
   manners with everyone plus overall day/night manners; 1 claim. (An earlier piracy-mirror
   citation was replaced with this directly-verified source.)
7. **Ch 78 (Medicine)** — *Journal of International Society for the History of Islamic
   Medicine* (JISHIM, vol 5, 2006, via Univ. of Brunei e-iLAMI repository): Kitab al-Tibb gives
   an idea of Muslims' conditions in the Prophet's time; most of prophetic medicine is
   preventive; 1 claim. A 2022 IJSSIR article with a near-identical abstract suggests copying,
   not independence → stays partial.

Caveat on the AlMaghrib notes: they are student class notes (medium confidence), not a
peer-reviewed publication; a second independent source was sought for each and not found.

## Per-chapter records

`hadith_chapter_intros.json` holds 97 objects (chapters 1–97, contiguous), each with:
`chapter_number`, `routes` (all three language routes), `claims` (claim → sources with
name/url/type/excerpt → status), `draft_en` (null everywhere — no draft may be built from
partial claims), `claim_source_map`, `overall`, `notes` (what was checked, rejected sources,
chapter title as already-published data).

## Conclusion

**No publishable introduction exists for any of the 97 chapters under the evidence rules.**
The 7 partial findings are documented with exact excerpts for future scholar review but must
not be published (single-source, one of them medium-confidence class notes). The honest
recommendation stands: keep all 97 chapter introductions NOT_PUBLISHED until a qualified
scholar sources and approves introduction text from named scholarly works.
