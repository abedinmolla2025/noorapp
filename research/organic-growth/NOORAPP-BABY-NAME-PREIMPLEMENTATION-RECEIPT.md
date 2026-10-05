# BABY NAME DETAIL PAGE — PRE-IMPLEMENTATION RECEIPT

**Date:** 2026-10-05 · **Mode:** READ-ONLY VALIDATION + DESIGN · **No code written, no DB writes, no deploy.**
**Dataset:** all 1,201 `admin_content` records (`content_type='name'`, `is_published=true`) pulled via anon REST.

## Dataset Validation

- **total:** 1201 (unique IDs 1201/1201; all `is_published=true`)
- **renderable:** 1201/1201 — every record has non-empty title, title_arabic, Bengali meaning (`content`),
  English meaning (`content_en`), and category (Boy 635 / Girl 566; gender derives deterministically
  from `category`). Slug column populated 0/1201 (slugs will be derived, not backfilled).
- **incomplete:** 1 — `ABRAR MOLLA` (id `91989171…`) missing only the optional `content_arabic`
  (Arabic-script *meaning*; `title_arabic` present). All required fields present.
- **duplicate names:** 2 exact pairs — `zahra` ×2 (both Girl; ar زهرة vs زهراء), `mina` ×2 (both Girl;
  ar مينا vs مِنى).
- **slug collisions:** 4 groups / 8 records — the 2 exact-duplicate pairs plus 2 normalization
  collisions: `abdul-musawwir` ("Abdul Musawwir" vs "Abdul-Musawwir"), `abdul-razzaq`
  ("Abdul Razzaq" vs "Abdul-Razzaq"). No empty slugs, no overlong slugs (max title 20 chars),
  no non-ASCII title characters; apostrophes (`Abdul Muta'ali`) and hyphens slugify cleanly.
- **excluded:** 0 hard exclusions. The 1 incomplete record is included in the test batch to verify
  graceful omission of the Arabic-meaning section; it is withheld from mass rollout pending that check.

## Proposed URL Model

`/baby-names/:slug` — e.g. `/baby-names/rabia`, `/baby-names/zahra-2`. The hub `/baby-names` is
unchanged. No route conflicts (`/names` 301 → `/baby-names` is preserved).

## Slug Algorithm

Deterministic, pure function of the record (no DB column, no randomness, stable forever):

1. `title.trim().toLowerCase()`
2. Unicode NFKD normalize, strip combining marks
3. drop every char except `[a-z0-9]`, space, hyphen
4. spaces/underscores → `-`; collapse repeats; strip leading/trailing `-`
5. empty result → record excluded (0 occurrences in this dataset)

The identical function is implemented once for the SPA (`src/lib/babyNameSlug.ts`) and once for the
API layer (`api/lib/babyNameSlug.js`, shared by prerender + sitemap), with a parity test over all
1,201 records (hadith-title-selector precedent).

## Duplicate Handling

Collision groups ordered by record `id` ascending (immutable → stable). First keeps the clean slug;
subsequent get `-2`, `-3` (the site's existing `-2` variant convention, cf. `surah-al-ikhlas-2`):

- `zahra` → `13c2ca1f…` (زهراء); `zahra-2` → `4865e669…` (زهرة)
- `mina` → `aa0c20bb…`; `mina-2` → `baddcadd…`
- `abdul-musawwir` → `0f2c5057…` ("Abdul-Musawwir"); `abdul-musawwir-2` → `62e71ad4…`
- `abdul-razzaq` → `83cf2660…` ("Abdul Razzaq"); `abdul-razzaq-2` → `dfd8ad09…`

Never silently overwrite; the allowlist (below) is the source of truth for which slugs exist.

## SEO Template (existing fields only)

- `<title>`: `{title} ({title_arabic}) — Meaning in Bengali & English | Noor`
- meta description (≤160 chars, deterministic truncation): `The name {title} ({title_arabic}) means
  “{content_en}” in English and “{content}” in Bengali. {Category} Islamic baby name.`
- H1: `{title}` + Arabic script; body blocks: English meaning, Bengali meaning, Arabic-script meaning
  (omitted gracefully when absent — 1 record), gender (from `category`), category, related names
  (same category, deterministic order, internal links).
- Canonical: self (`https://noorapp.in/baby-names/{slug}`); robots `index,follow` (allowlisted only).
- JSON-LD `DefinedTerm`: `name`={title}, `description`={content_en}, `inDefinedTermSet`→`/baby-names`
  (all values directly supported; no invented schema values).

## Prerender Strategy

New branch in `api/prerender.js` matching `^/baby-names/([a-z0-9-]+)$`:
allowlisted slug → fetch published names (module-cached), find by slugify, render the intro HTML
(same visual structure as SPA) with title/canonical/robots/JSON-LD; **anything else → 404 +
`noindex,follow`** (fail-closed, existing pattern). Unknown/invalid slugs never 200.

## Sitemap Gate

Verification-gated via a new allowlist file `src/data/baby-name-sitemap-allowlist.json` (array of
slugs), copied to `public/data/` at build by `scripts/extract-tool-data.mjs` (quiz-canonicals
precedent). `api/sitemap.js` gains `getVerifiedNameRoutes()`: REST-fetch published names, slugify,
emit only allowlisted slugs (dedupe-guarded). **Initial rollout: 13 slugs** (below). Mass rollout
only after the batch passes every verification gate.

## Representative Test Set (13 URLs)

- `/baby-names/rabia` — normal, Girl, bn+en meanings
- `/baby-names/ahmad` — normal, Boy
- `/baby-names/abdul-mutaali` — apostrophe in source title
- `/baby-names/abdul-alim` — hyphen in source title
- `/baby-names/zahra`, `/baby-names/zahra-2` — duplicate-name disambiguation
- `/baby-names/mina`, `/baby-names/mina-2` — duplicate-name disambiguation
- `/baby-names/abdul-musawwir`, `/baby-names/abdul-musawwir-2` — normalization collision
- `/baby-names/abdul-razzaq`, `/baby-names/abdul-razzaq-2` — normalization collision
- `/baby-names/abrar` — missing optional Arabic meaning (graceful-omission check; corrected from ABRAR MOLLA 2026-10-05, see NOORAPP-BABY-NAME-ABRAR-CORRECTION-RECEIPT.md)

## Risks

- **Scaled thin-content perception** (primary): mitigated by unique per-page substance, gated rollout,
  and noindex-by-default for non-allowlisted slugs.
- **Slug stability:** algorithm frozen in the parity-tested shared function; any future algorithm change
  requires redirect mapping (documented, not needed now).
- **Arabic RTL rendering:** verified in parity step (all 1,201 titles render; sample in test set).
- **No GSC:** ranking impact unmeasurable; coverage + fetch-health metrics substitute.

## Files That Would Change

- NEW `src/lib/babyNameSlug.ts` · NEW `api/lib/babyNameSlug.js` · NEW `src/pages/BabyNameDetailPage.tsx`
- NEW `src/data/baby-name-sitemap-allowlist.json` (13 slugs) · NEW slug-parity test script
- EDIT `src/App.tsx` (route) · EDIT `api/prerender.js` (branch) · EDIT `api/sitemap.js` (gated routes) ·
  EDIT `scripts/extract-tool-data.mjs` (copy allowlist)

## Files That Must NOT Change

`/baby-names` hub route/page/SEO block · `src/pages/BabyNamesPage.tsx` · DB schema and all
`admin_content` rows · every other route, class, sitemap section, robots, redirects · scheduler/push/
Lovable/auth/GSC · all parked items (content_en repair, fragment arrays, chapter-0, P0 commits).

## Decision

**READY_FOR_IMPLEMENTATION**

Stage 1 (read-only) is complete with zero production impact: the dataset is suitable (1201/1201
renderable, 4 collision groups resolved deterministically, 0 hard exclusions), the slug algorithm is
validated collision-free across all records, and the design is minimal, additive, and fully gated.
No blocker found. Implementation may proceed on your approval — representative 13-URL batch first,
mass rollout only after the verification gates pass.
