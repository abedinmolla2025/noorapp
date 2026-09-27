# NOOR ADSENSE REMEDIATION — PHASE 0 BASELINE REPORT

**Date:** 2026-09-27
**Production:** https://noorapp.in
**Repo:** /home/hatch/workspace/noorapp, branch `main`
**HEAD:** `57b282d9a550ab36ba3cbf4160d9b4e86d3d418e` ("SEO: complete P1 AdSense readiness fixes")
**Mode:** read-only. Nothing modified in Phase 0.

## 1. Git / working-tree state

- Branch `main`, HEAD == production commit `57b282d` (verified via `git rev-parse HEAD`).
- Remote: `origin https://github.com/abedinmolla2025/noorapp.git`.
- **4 uncommitted modified files — the 5-story pilot. DO NOT TOUCH:**
  - `api/prerender.js` (+44 lines: story-branch pilot enrichment rendering)
  - `public/stories.json` (pilot fields on 5/74 records)
  - `src/lib/stories.ts` (storyEnrichment pilot gate)
  - `src/pages/StoryDetailPage.tsx` (pilot UI)
- Pilot DB backfill was completed separately by the user (Supabase `admin_content` holds `applications_bn`, `takeaways_bn`, `related_source_links` on 5 rows); production code ignores them, so they are invisible on the live site.

## 2. Sitemap / route inventory

- **1,003 URLs** in production `sitemap.xml` (generated dynamically by `api/sitemap.js`):
  - 26 base routes + 218 duas + 74 stories + 114 surahs + 291 hadith chapters (97 × 3 langs) + 281 verified-active quiz UUIDs − dedup overlap.
- Route families: `/` home · `/quran[/:surahId[/:ayahId]]` · `/hadith[/sahih-bukhari[/:lang[/:chapterSlug[/:hadithNumber]]]]`, `/hadith/h/:slug`, `/hadith/:bookId` placeholder · `/dua[/category/:slug][/:slug]` · `/stories[/category/:category][/:slug[/trailer]]` · `/quiz[/:id]` · tools (`/prayer-times /prayer-guide /qibla /tasbih /99-names /baby-names /calendar`) · trust (`/about /contact /sources /privacy-policy /terms`) · misc (`/download /islamic-app /sitemap`) · `/admin*` (24 routes, noindex) · `/names` → 301 `/baby-names`.
- 60/60 random sitemap URLs returned HTTP 200 on 2026-09-27.

## 3. Indexability / canonical / error behavior (prerender is the SEO authority)

`api/prerender.js` (Vercel serverless, `X-Noor-Prerender: v101`) serves bot HTML for every content route:
- Indexable pages: `index,follow` + self-canonical (surah/ayah URLs canonicalize to the surah; story trailer → story).
- Invalid routes → **404 + `noindex,follow`**: bad surah id, bad dua slug/category, bad story slug, bad hadith language, missing `/hadith/h/:slug`, ineligible/missing quiz, unknown arbitrary paths (no indexable app shell).
- `test-story-manus` → **410 + `noindex,follow`**.
- `/hadith/:bookId` non-Bukhari → placeholder page, **200 + `noindex,follow`**, copy: *"This collection is being prepared. Check back soon. ইনশাআল্লাহ।"* (not in sitemap).
- Client-side gaps (bots protected by prerender, but noted): bad story slugs render no Helmet noindex client-side; invalid hadith lang soft-navigates (200); no contradiction for Googlebot.
- **`/sitemap` self-contradiction:** the React `SitemapPage` emits `noindex,follow`, but prerender serves `/sitemap` as `index,follow`. One signal must win (Phase F).
- JSON-LD: WebSite+Organization `@graph` sitewide; BreadcrumbList auto-generated; Article on dua/story/`/hadith/h/` detail; Quiz+Question/Answer on quiz detail; FAQPage hardcoded on `/quran /hadith /dua /quiz /hadith/sahih-bukhari* /about /prayer-times /prayer-guide /tasbih /qibla /99-names /baby-names /calendar`; `hreflang` bn/en/ur on hadith article pages.
- **WebSite JSON-LD advertises `SearchAction` → `/search?q=…`, but no `/search` route exists.**

## 4. AdSense behavior (dormant, safe)

- `index.html` contains only the `google-adsense-account` verification meta (`ca-pub-2770098542057651`); no script tag.
- `AdSenseLoader` (App.tsx) fires `loadAdSense()` only when `system.adsensePublisherId && system.showAds` from `app_settings`; production `showAds=false` confirmed (zero `adsbygoogle` on all sampled pages).
- Loader additionally refuses: WebViews/Capacitor, FB/IG in-app, PWA standalone, iframes, bot UAs, `/admin`.
- Prerender `inject()` regex-strips ad scripts + the adsense meta on any `statusCode ≥ 400` or `noindex` response — error/noindex pages can never be ad-bearing.
- `ads.txt` → `google.com, pub-2770098542057651, DIRECT`. Privacy policy discloses AdSense/third-party processors. **No ads will be activated during this remediation (Phase J = verification only).**

## 5. Content-family status (production, verified 2026-09-27)

| Family | Records | Status |
|---|---|---|
| Quran | 114 surahs | Full Arabic + complete Bangla translation per ayah; 114-surah hub index. **No translator attribution anywhere** (uses `bn.bengali` from api.alquran.cloud, unnamed). No surah context layer (no intro/tafsir/prev-next/related). `revelationType` (Meccan/Medinan) exists in `src/data/quran_surahs.json` but renders only on the hub, not surah pages. Bismillah translation dropped on 2:1. |
| Hadith | 291 chapters (97×3) | Trilingual Sahih al-Bukhari; Bangla translated-attributed **in data text** (Tawhid/Modern Publications + Islamic Foundation numbering) — no attribution *field* exists; English/Urdu unattributed. Bangla rows from Supabase `hadiths`; EN/UR from bundled JSON (7,274 vs 6,971 records — ~303 fewer Urdu). No chapter-intro field; no prev/next chapter. Collection hub `/hadith/sahih-bukhari` = 261-char language picker. |
| Dua | 218 | Template is strong (Arabic+transliteration+meaning+virtue+source+explanation). **Virtue forensic: only 9 distinct virtue texts across 218 records** (58 empty, 58× "Dua relieves burden…", 50× "This dua reconnects…", 28× "Sincere reliance…", 19× "Allah loves those who repent…", 2+1+1+1). 110 of 160 virtue-carrying records have **no virtue_reference**. Runtime data = Supabase `admin_content` (the JSON file is the bulk-import source). |
| Stories | 74 | Depth uneven: `content_bn` min 397 / max 6,678 / median 1,296 chars. All carry `source_name`+`reference`+`source_detail`. **Trailing-"|" titles are a prerender bug, not a data bug**: `uniqueStoryTitle()` truncates to 70 chars at word boundary and the trailing-punctuation strip regex omits `|` — data has 0/74 trailing pipes. `navigation.related_stories` exists in data. Dual read paths: prerender reads bundled `public/stories.json` first, SPA reads Supabase. |
| Quiz | 281 | Substantive Q&A with bilingual explanations + source criticism. All URLs bare UUIDs. `/quiz` hub = ~700 chars generic copy, no question index (though `category` field exists and the SPA fetches all questions). Sources link outward only (no internal links to Noor Quran/Hadith routes). |
| Tools | 7 + download + islamic-app | ~700–900 chars prerendered SEO copy + JS tool; no server-rendered data. SSR-able data identified: 99 Names (all 99 hardcoded in `NamesOfAllahPage.tsx`), prayer-guide 9 steps (hardcoded `PRAYER_STEPS`), tasbih dhikr list (hardcoded), calendar month names; baby names from Supabase (`content_type='name'`); prayer times/qibla need live geolocation. `IslamicEducationalSection` (crawler-visible content block) used on only 4 pages. |
| Trust | 5 | `/sources` is strong methodology BUT overstates inventory (see §7). `/contact` concrete (email, 24–48h). Privacy discloses AdSense. `/terms` names operator. |

## 6. Data integrity / known warnings

1. **Prerender fail-open:** uncaught handler exceptions return plain `app.html` with HTTP 200 (thin shell, no noindex) — a Supabase/API outage could serve indexable shells.
2. **Duplicate `"/quiz"` key** in `STATIC_PAGE_COPY` (prerender.js ~L357 and ~L494); second silently wins.
3. **Sitemap drift risk:** 74 story slugs hard-coded in `api/sitemap.js`; hadith chapters a hard-coded 1–97 loop; quiz eligibility gated in 3 places (client, prerender, sitemap) — keep in sync.
4. **Anon Supabase key hard-coded** as fallback in `api/prerender.js` / `api/sitemap.js` (public anon key, RLS-scoped — acceptable, hygiene note).
5. `public/quiz-questions-90.json` is stale legacy (285 records, thinner schema) — verify nothing consumes it at runtime.
6. **No `typecheck` or `test` npm scripts** — `build` = `vite build && mv dist/index.html dist/app.html` (rename is load-bearing for prerender); `lint` = `eslint .`.
7. `service_role` appears only in `supabase/functions/*` edge functions; `api/` and `src/` use anon key only.
8. `StoryCategoryPage` brand string "NoorApp" vs "Noor" elsewhere (cosmetic).
9. Prerender cache: `s-maxage=300`; static HTML routes `no-store`.

## 7. Trust-integrity defects to fix (confirmed in BOTH prerendered production HTML and repo)

- **A1 — `/sources`:** *"Noor uses the six major Sunni collections (Kutub as-Sittah):"* + FAQ *"Noor primarily uses Sahih al-Bukhari and Sahih Muslim … along with the four Sunan"* — only Bukhari is live. Present in prerendered production HTML.
- **`/hadith` JSON-LD FAQ** (`src/components/SeoHead.tsx`): claims the site features "Sahih Muslim, Jami at-Tirmidhi, and Sunan Abu Dawud" — same overstatement class, in structured data.
- **`/about` JSON-LD FAQ**: *"It also includes Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi, and Sunan Abu Dawud Hadith collections"* — same issue.
- **`/about` founder mismatch:** repo `AboutPage.tsx` has a "Founder & Developer" section (ABEDIN MOLLA, India) + matching FAQ, but **production prerendered `/about` contains zero operator mentions** — the `STATIC_PAGE_COPY` "/about" entry is stale/generic. Prerender/client content mismatch; crawlers see the anonymous version.
- **`/hadith` hub:** Bukhari card live; Muslim/Tirmidhi/Abu Dawud cards route to noindex placeholders. Indexed page presents unavailable collections alongside the live one.

## 8. Files likely to change per phase (planning only — Phase 0 changed nothing)

- **Phase A:** `api/prerender.js` (STATIC_PAGE_COPY "/sources", story `uniqueStoryTitle` regex), `src/pages/DataSourcesPage.tsx`, `src/components/SeoHead.tsx` (FAQ JSON-LD), `src/pages/AboutPage.tsx` (FAQ JSON-LD), `src/pages/HadithPage.tsx`, Supabase `admin_content` dua rows (virtue fields — DB writes need backup + before/after verification; anon key cannot write, so writes go through user-operated SQL per the pilot precedent).
- **Phase B:** `api/prerender.js` (tool branches: 99-names list, prayer-guide steps, tasbih dhikr, calendar explainer; `/quiz` hub index), `src/pages/NamesOfAllahPage.tsx`, `src/pages/PrayerGuidePage.tsx`, `src/lib/pageContent/utilityPages.ts`, `src/pages/QuizPage.tsx`, story title fix (same prerender regex), story depth via DB `admin_content` (+ bundled `public/stories.json` sync — conflicts with uncommitted pilot edits; coordinate carefully).
- **Phase C:** `api/prerender.js` + `src/pages/QuranPage.tsx`/`SurahReader.tsx` (revelationType badges, translator-attribution line — translator identity BLOCKED unless evidence found), hadith chapter prev/next (prerender + `BukhariLangPage.tsx`; no chapter-intro field exists — DB migration would need service access, likely BLOCKED → code-side minimal context only from existing data).
- **Phase D:** `DuaDetailPage.tsx`, `StoryDetailPage.tsx`, `QuizDetailPage.tsx` + matching prerender branches (related-content sections from existing `related_duas`/`related_stories`/`source_reference` data).
- **Phase E:** `src/pages/AboutPage.tsx` + prerender "/about" copy sync, `DataSourcesPage.tsx`, `ContactPage.tsx`.
- **Phase F:** `api/prerender.js`, `api/sitemap.js`, `SeoHead.tsx`, `SitemapPage.tsx` (placeholder links), `/sitemap` robots contradiction.
- **Phase G:** new `scripts/quality-gates.*` + `package.json` script entry.
- **Phase H:** the 4 uncommitted pilot files — read-only verification + parity checks; no edits except where the user authorizes.
- **Phase I:** component/CSS touch-ups only for verified mobile issues.
- **Phase J:** verification only — no ad activation.
- **Phase K:** full re-audit; report only.

## 9. Standing blockers / owner-input items

- Dua virtue rewrites: no invented virtues — unsupported claims get removed or neutrally restructured, never replaced with fabricated text.
- Quran/Hadith translator identities: do not guess; unattributed lines stay factual about the gap.
- Founder/credential additions beyond what the repo already states: owner input required.
- Any Supabase write: backup/export first, verify before/after; schema migrations (e.g. new `hadith_chapters.description`) need privileged access — treat as BLOCKED unless the user provides a path.
- No commit, no push, no deploy without explicit authorization (per work order).
