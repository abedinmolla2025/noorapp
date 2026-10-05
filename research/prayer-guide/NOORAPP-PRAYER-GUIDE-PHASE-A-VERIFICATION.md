# NOORAPP — PRAYER GUIDE PHASE A — IMPLEMENTATION VERIFICATION

Date: 2026-10-05 (IST) · IMPLEMENTATION + VERIFICATION ONLY. NOT DEPLOYED. NOT PUSHED.
Source audit: research/prayer-guide/NOORAPP-PRAYER-GUIDE-FORENSIC-AUDIT.md (PRAYER_GUIDE_AUDIT_PASS_WITH_REMEDIATION)

Scope boundary honored: no new Islamic content, no Wudu instructions, no niyah/recitation/ruling changes,
no citations invented, no scholar review, no DB writes, no unrelated page changes.

## §1 — Wudu claim mismatch (metadata now describes actual content)

- `api/prerender.js` STATIC_PAGE_COPY["/prayer-guide"]:
  title "Prayer Guide | Salah and Wudu Guidance | Noor" → "Prayer Guide | Step-by-Step Salah Guide | Noor";
  description rewritten to "…review key Salah steps, Niyah wordings, recitations and Duas in a clear English and Bengali format."
- `src/pages/PrayerGuidePage.tsx` Helmet: EN description → "Step-by-step Salah guide covering prayer steps,
  Niyah wordings, recitations and Duas in English and Bengali."; BN description: ওযু claim removed
  ("নামাজের নিয়ম, নিয়ত, দোয়া ও তাশাহহুদ সহ সম্পূর্ণ নামাজ শিক্ষা গাইড। ধাপে ধাপে নামাজ শিখুন।").
- `src/components/seo/SeoHead.tsx`: removed the Wudu/illustrations FAQ entry
  ("Does Noor have a step-by-step prayer guide?"); kept the beginners FAQ verbatim.
- Verified: 0 remaining Wudu claims in Prayer Guide title/meta/FAQ (legitimate content mention
  "Breaking Wudu during prayer" in the invalidators list untouched).

## §2 — Dead audio buttons removed

- Removed both non-functional Volume2 `<button>`s (NiyahCard, DuaCard) and the now-unused import.
- No TTS implemented, no fake audio, no new services. Verified: 0 Volume2 references remain;
  no UI element promises audio functionality.

## §3 — SPA/prerender content parity (existing content only, no rewrites)

- `scripts/extract-tool-data.mjs`: added deterministic extraction jobs —
  `const NIYAH_DATA` → `prayer-guide-niyah.json` (14), `const PRAYER_LEARNING` → `prayer-guide-learning.json` (5),
  `const PRAYER_DUAS` → `prayer-guide-duas.json` (9); added object-literal support to the validator.
  All three JSONs committed (consistent with tracked `prayer-guide-steps.json`).
- `api/prerender.js`: added `renderPrayerGuideNiyah()`, `renderPrayerGuideLearning()`, `renderPrayerGuideDuas()`;
  `/prayer-guide` now prerenders Steps (9) + Niyah (14) + Learn (5) + Duas (9).
- **Deterministic parity check: 184/184 field comparisons PASS** — every SPA name/rakats/Arabic/meaning/
  transliteration/action/recitation/explanation/bullet renders byte-identical (modulo HTML escaping)
  in the prerendered HTML. SPA content set == prerender content set.

## §4 — FAQ schema parity

- Prerender now emits FAQPage JSON-LD for /prayer-guide via `prayerGuideFaqJsonLd()`,
  byte-identical Q&A to the SPA's SeoHead entry (verified: same question string in both files).
- No invented FAQ content; the Wudu-based entry was removed, not rewritten.

## §5 — OG image parity

- Added route-specific `TOOL_OG_IMAGES` map: `/prayer-guide` → `https://noorapp.in/og-prayer-guide.png`
  (the existing intended asset). Prerender and SPA now emit the identical og:image. No other routes changed.

## §6 — Accessibility

- Heading hierarchy: all 5 card/section `<h3>` → `<h2>` under the single H1 (H1→H2 logical order).
- Buttons: dead audio buttons removed; search input gained `aria-label`; remaining buttons all have text.
- tsc: 0 errors.

## Verification summary

- tsc: **0 errors** · `npm run build`: **PASS** (extract script regenerates all 4 prayer-guide JSONs)
- Local prerender (/prayer-guide, Googlebot UA): 13/13 checks PASS — wudu-free title/meta, og-prayer-guide.png,
  FAQPage JSON-LD, 14 niyah + 9 duas + 5 learn + 9 steps rendered, Arabic `lang` attrs, self-canonical, index,follow
- Content parity: **184/184 PASS**
- Unrelated-change check: diff limited to `api/prerender.js`, `scripts/extract-tool-data.mjs`,
  `src/components/seo/SeoHead.tsx` (1 line), `src/pages/PrayerGuidePage.tsx`, +3 generated JSONs.
  `api/sitemap.js` untouched. Pre-existing unrelated `scripts/verify-hadith-title-consistency.mjs` modification preserved, not included.
- No DB writes. No content/wording changes to any religious text.

## Not done (reserved)

Scholar/source-review items (§3 of audit: niyah formulations, Hanafi framings, Arabic accuracy) — untouched per scope.

## Final verdict

**PHASE_A_IMPLEMENTATION_READY** (deployment requires separate approval; not deployed, not pushed)
