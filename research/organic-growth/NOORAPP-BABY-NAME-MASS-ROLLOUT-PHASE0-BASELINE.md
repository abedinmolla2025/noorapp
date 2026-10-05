# BABY-NAME MASS ROLLOUT — PHASE 0 BASELINE RECEIPT

Date: 2026-10-05 (IST). Read-only; nothing modified.

## Current implementation

1. **Detail page** (`src/pages/BabyNameDetailPage.tsx`): allowlist-gated SPA route `/baby-names/:slug`.
   Fetches all published name records, resolves slug→record via the shared deterministic slug lib,
   renders only DB fields (title, Arabic script, English/Bengali/Arabic meanings, gender/category).
   Related names: same-category, allowlisted only, max 6. Non-allowlisted slug → noindex not-found view.
2. **Slug function** (`src/lib/babyNameSlug.js`): single canonical implementation shared by SPA,
   prerender, sitemap. NFKD → strip marks → keep [a-z0-9 -] → hyphens → collapse/trim.
   Collisions ordered by immutable record ID: first keeps clean slug, rest get -2, -3…
3. **Prerender** (`api/prerender.js`): allowlist-gated. Allowlisted slug → 200, correct record,
   self-canonical, index,follow, DefinedTerm JSON-LD from DB fields. Unknown/non-allowlisted →
   404 + noindex,follow. No soft 404s.
4. **Sitemap** (`api/sitemap.js` `getVerifiedNameRoutes`): verification-gated. Emits only allowlisted
   slugs that resolve to a real record via the deterministic slug map; deduped; never more than allowlist size.
5. **Allowlist** (`src/data/baby-name-sitemap-allowlist.json`, 13 slugs) → copied at build by
   `scripts/extract-tool-data.mjs` → `public/data/baby-name-sitemap-allowlist.json`, read by prerender/sitemap.
6. **Current 13 production URLs**: rabia, ahmad, abdul-mutaali, abdul-alim, zahra, zahra-2, mina, mina-2,
   abdul-musawwir, abdul-musawwir-2, abdul-razzaq, abdul-razzaq-2, abrar.
7. **Known collision groups** (5): zahra, mina, abdul-musawwir, abdul-razzaq, abrar. Full enumeration in Phase 2.
8. **Intentionally excluded**: `abrar-2` (existing Girl Abrar record `d94f507e…`) — the only explicit exclusion.
   Deterministic slug map still assigns it `abrar-2`; it is simply not allowlisted, so it fail-closes to 404+noindex.

## Architecture verdict

No code changes required for mass rollout: every layer gates on the allowlist JSON, which is data.
Rollout = regenerate the allowlist from the authoritative 1,201-record dataset (minus explicit exclusions),
then verify at full scale.
