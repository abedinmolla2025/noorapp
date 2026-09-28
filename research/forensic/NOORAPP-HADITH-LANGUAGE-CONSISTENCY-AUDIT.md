# NOORAPP — Hadith Book Language Consistency Audit & Fix

**Date:** 2026-09-28
**Mode:** FORENSIC → MINIMAL FIX → FULL VERIFICATION
**Baseline:** git `6fece41` → `7d98199` · Vercel `dpl_8mXTYR65WbgEYcc88XEmG2agvgdA` READY on **noorappold**
**DB:** `hadith_chapters` (book_id=bukhari), 97 rows — **unchanged, zero writes**

---

## 1. Root cause

Two selection-logic defects, no data corruption (the DB is clean: all 97 `title`
values are pure Latin, all 13 non-null `title_bn` are Bengali script, all 97
`title_ar` present).

### D1 — SPA-only hardcoded chapter-97 override (P1, fixed)
`src/pages/bukhari/BukhariLangPage.tsx` (kitabMap `useMemo`) replaced the DB row
for chapter 97 whenever `title_bn` was NULL with hardcoded
`{ title: "Tawheed", title_bn: "তাওহীদ (আল্লাহর একত্ববাদ)", hadith_count: 188 }`.
The prerender (`api/prerender.js`) had no such override. Consequences:
- **English mode:** SPA showed "Tawheed" instead of the reconstruction's verified
  canonical title "Oneness, Uniqueness of Allah (Tawheed)".
- **Bangla mode:** SPA showed an **unverified** Bengali title, violating the
  verified-only contract.
- **Bot vs browser:** prerender and SPA disagreed for chapter 97 in EN and BN —
  inconsistent `<title>`, H1, breadcrumbs, JSON-LD.

### D2 — Bangla-mode per-record fallback over 84 NULL `title_bn` (P2, by design)
84 of 97 records have `title_bn = NULL` (deliberately NULL: no verified Bengali
source exists; inventing translations is forbidden). The `title_bn || title`
fallback therefore rendered **15 Bengali + 82 English** titles on one list under
a single Bangla language selection — the reported mixing. English mode was 97/97
pure English and Urdu mode 97/97 pure Arabic throughout.

---

## 2. Affected records

- **D1:** chapter 97 only (all other 96 chapters were already SPA≡prerender).
- **D2:** all 97 chapters in Bangla mode (84 fall back to verified English).

## 3. Before / after title-selection behavior

| Mode | Before | After |
|---|---|---|
| Bangla | `title_bn \|\| title` (two divergent implementations; ch97 unverified injection) | `selectHadithChapterTitle` — same rule, centralized; ch97 unverified injection removed |
| English | `title` | `selectHadithChapterTitle` (ch97 now canonical) |
| Urdu | `title_ar \|\| title` | `selectHadithChapterTitle` (unchanged) |
| Missing record | SPA `"কিতাব N"` vs prerender `"কিতাব"` | identical bare generic label on both |

**Chapter 97 specifically:**
- EN: "Tawheed" → **"Oneness, Uniqueness of Allah (Tawheed)"** (canonical)
- BN: "তাওহীদ (আল্লাহর একত্ববাদ)" (unverified) → **"Oneness, Uniqueness of Allah (Tawheed)"** (verified EN fallback)
- UR: "كتاب التوحيد" (unchanged) · hadith count 188 (unchanged — DB value matched)

## 4. Exact files changed

- `src/lib/hadithChapterTitle.ts` — **NEW** (112 lines): the single deterministic
  selector `selectHadithChapterTitle` + verified ch38/82 overrides.
- `src/pages/bukhari/BukhariLangPage.tsx` — `getChapterName` delegates to the
  shared selector; ch97 kitabMap override deleted (−18/+9).
- `api/prerender.js` — `getHadithChapterName` rewritten to mirror the contract
  verbatim + contract comment (−6/+19).
- `scripts/verify-hadith-title-consistency.mjs` — **NEW** (150 lines): 97×3
  parity + contract assertions.
- `research/forensic/NOORAPP-HADITH-MISSING-BN-TITLES.json` / `.csv` — **NEW**:
  84 missing-BN records.

## 5. Database

**Not changed.** Zero writes. 97 rows, titles/numbers/ranges/Arabic identical
before and after. No RLS/policy/trigger changes.

## 6. Missing Bengali translations

84 chapters have `title_bn = NULL` (chapters 10–13, 15, 16, 18–24, 27–37, 39–97).
13 verified Bengali titles exist (chapters 1–9, 14, 17, 25, 26); ch38/ch82
display Bengali via the explicitly verified override table. **Nothing was
invented.** Machine-readable report:
`research/forensic/NOORAPP-HADITH-MISSING-BN-TITLES.json` (+ `.csv`).

## 7. Tests performed

| Test | Result |
|---|---|
| `scripts/verify-hadith-title-consistency.mjs` (291 parity + contract + ch97 canonical + override equality) | **PASS** |
| `tsc --noEmit` | 0 errors |
| `npm run build` | PASS (24.89s) |
| ESLint on new/changed files | 0 new (23 pre-existing in BukhariLangPage.tsx, byte-identical on pristine tree) |
| `research/forensic/validate_mapping.py` | 21/21 PASS |
| `scripts/verify-phase8.mjs` (Hadith remediation regression) | ALL PASS |
| Hub-list parity via local prerender (291 card comparisons) | 0 mismatches |
| `scripts/quality-gates.mjs` | 1 **pre-existing** failure: `[duplicate-titles]` ch35 bangla/english share `<title>` (70-char truncation artifact of the approved EN fallback) — confirmed identical on the pristine tree; not a regression |

## 8. 97/97 verification

All 97 chapters × bangla/english/urdu run through **both** selectors:
**97/97 PASS** — SPA ≡ prerender on every record and language; contract holds
(BN→verified BN else verified EN; EN→verified EN; UR→verified AR else verified
EN; no Arabic script in BN/EN outputs).

## 9. Production / mobile verification

Deployment `dpl_8mXTYR65WbgEYcc88XEmG2agvgdA` **READY** on noorappold.
Live checks with mobile UA:
- **Hub lists** `/hadith/sahih-bukhari/{bangla,english,urdu}`: **97/97 cards
  correct on each**; ranges 1–20, 21–40, 41–60, 61–80, 81–97 all correct;
  0 mismatches vs the contract.
- **Chapter-97 pages** (EN/BN/UR): HTTP 200, canonical `<title>`, H1, breadcrumbs,
  self-canonical, `index,follow`, JSON-LD present; **zero stale remnants**
  (no short "Tawheed", no unverified Bengali string).
- **Deployed SPA bundle**: contains no old override strings.

## 10. Regression result

- Hadith reconstruction intact: 265/265 titles, 97/97 Arabic, 13 intros live,
  mapping validator 21/21, phase-8 ALL PASS.
- No AdSense submitted. No indexing requested. `noorapp-ucmi` untouched.

## Remaining work (not this fix)

1. **84 missing verified Bengali titles** — need scholar/source translation work;
   tracked in `NOORAPP-HADITH-MISSING-BN-TITLES.*`; nothing invented.
2. **Pre-existing `[duplicate-titles]` gate** on ch35 bangla/english — a
   `<title>` 70-char truncation artifact; separate SEO-template decision if
   desired.
3. **HadithDetailPage** (`/hadith/h/:slug`) chapter breadcrumb is intentionally
   Bengali-first (trilingual page) — reviewed, deliberately unchanged.
