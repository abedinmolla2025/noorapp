# ABRAR CORRECTION — VALIDATION RECEIPT

Date: 2026-10-05 (IST)
Scope: single-record title correction `ABRAR MOLLA` → `Abrar`, then full re-validation.
No mass rollout. No schema change. No other record touched.

## Before

- Title: `ABRAR MOLLA`
- Gender: Boy
- Record ID: `91989171-77eb-4094-8bca-8db8a81bafcf`
- Arabic script: `أبرار`
- Bengali meaning: `পুণ্যবান, ধার্মিক, সৎকর্মশীল`
- English meaning: `Virtuous, pious, righteous`
- Arabic meaning: NULL

## Correction

- Old title: `ABRAR MOLLA`
- New title: `Abrar`
- Fields changed: `title` ONLY (guarded by id + content_type='name' + old title; 0 rows if already corrected)
- SQL artifact: `research/organic-growth/NOORAPP-BABY-NAME-ABRAR-CORRECTION.sql`
- Executed by: user, in Supabase dashboard SQL editor (confirmed 2026-10-05)

## After

- Corrected title: `Abrar` ✓
- Gender: Boy (unchanged) ✓
- Arabic script: `أبرار` (unchanged) ✓
- Bengali meaning: `পুণ্যবান, ধার্মিক, সৎকর্মশীল` (unchanged) ✓
- English meaning: `Virtuous, pious, righteous` (unchanged) ✓
- Arabic meaning: NULL (unchanged) ✓

Existing Abrar Girl record (unchanged, all fields byte-identical to pre-correction):

- Record ID: `d94f507e-45d4-4a39-8df1-559f92ff09c3`
- Title: `Abrar` | Gender: Girl
- Arabic script: `أبرار`
- Bengali meaning: `সৎ; ধার্মিক`
- English meaning: `Righteous; pious`
- Arabic meaning: `الأبرار (الصالحون)`

Other fields unchanged: YES — for both records every field except the target's `title` matches the documented pre-correction values.

## Full Dataset

- Total: 1,201 (unchanged)
- Unique IDs: 1,201 (no rows added or deleted)
- Records still titled `ABRAR MOLLA`: 0
- Records titled `Abrar`: exactly 2 (Boy `91989171…`, Girl `d94f507e…`)
- Unexpected changes: none detected. (Note: no full per-record baseline snapshot existed before the correction, so this rests on count/ID stability, both Abrar records' full field values vs documented before-state, zero old-title rows, and all 1,201 slugs deriving deterministically from current titles.)

## Slug Results

- Abrar Boy → `abrar` ✓
- Abrar Girl → `abrar-2` ✓ (not exposed; fail-closed, 404 + noindex)
- All collision groups (deterministic, immutable-ID ordered):
  - `zahra` → Girl `13c2ca1f…` | `zahra-2` → Girl `4865e669…` ✓
  - `mina` → `aa0c20bb…` | `mina-2` → `baddcadd…` ✓
  - `abdul-musawwir` → `0f2c5057…` | `abdul-musawwir-2` → `62e71ad4…` ✓
  - `abdul-razzaq` → `83cf2660…` | `abdul-razzaq-2` → `dfd8ad09…` ✓
  - `abrar` → Boy `91989171…` | `abrar-2` → Girl `d94f507e…` ✓ (new group, post-correction)
- 1,201/1,201 slugs unique, URL-safe, derived deterministically from titles ✓
- No new unresolved collisions ✓

## Allowlist

- Old: `[..., "abrar-molla"]` (13 URLs)
- New: `[..., "abrar"]` (13 URLs — count unchanged)
- `abrar-2` deliberately NOT exposed
- Retired slug `/baby-names/abrar-molla` now fail-closed: 404 + `noindex,follow` ✓

## Post-correction test matrix (all local, pre-deploy)

- tsc: 0 errors ✓
- Production build: PASS ✓
- Slug validator `scripts/verify-baby-name-slugs.mjs`: ALL PASSED ✓
- Prerender: 13/13 allowlisted routes → 200 + self-canonical + `index,follow` + DefinedTerm JSON-LD + correct record content (Arabic/Bengali/English) ✓
- `/baby-names/abrar` renders the corrected Boy record content ✓
- Invalid/non-allowlisted (`abrar-molla`, `abrar-2`, `no-such-name`, `ABRAR`): 404 + `noindex,follow` ✓
- Sitemap: 985 URLs (972 + 13), 0 duplicates, exactly 13 name-detail URLs, `abrar` present, `abrar-molla`/`abrar-2` absent, hub present once ✓
- `/baby-names` hub: 200 + self-canonical, SEO-critical output unchanged ✓

## Verdict

**ABRAR_CORRECTION_PASS**

Deployment of the 13-page representative batch is NOT included in this receipt and remains a separate approval.
