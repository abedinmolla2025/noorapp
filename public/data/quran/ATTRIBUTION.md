# Quran Dataset — Source & License Note

**Dataset location:** `public/data/quran/`
**Downloaded:** 2026-10-15 via `scripts/download-quran-editions.mjs` (re-runnable)
**Upstream source:** AlQuran Cloud API — `https://api.alquran.cloud/v1/quran/{edition}`
**Verification:** `node scripts/verify-quran-dataset.mjs` (114 files/edition, ayah counts, checksums)

## Layout

| Path | Content |
|------|---------|
| `quran-uthmani/surah-<n>.json` | Arabic (Uthmani) text — the **single** Arabic edition used by both the SPA and the prerender function |
| `audio.json` | Per-ayah recitation audio URLs (`ar.alafasy`, `https://cdn.islamic.network/...`) — URLs only, audio files are **not** vendored |
| `bn.bengali/surah-<n>.json` | Bengali translation |
| `en.sahih/surah-<n>.json` | English translation |
| `ur.ahmedali/surah-<n>.json` | Urdu translation |
| `hi.hindi/surah-<n>.json` | Hindi translation |
| `id.indonesian/surah-<n>.json` | Indonesian translation |

## License / permission status (per edition)

| Edition | Translator / source | Status |
|---------|---------------------|--------|
| `quran-uthmani` (Arabic) | Uthmani text via AlQuran Cloud; originates from the **Tanzil project** (https://tanzil.net) | Text kept **unmodified**; source cited with Tanzil.net link (this file + Data Sources page) |
| `bn.bengali` | Muhiuddin Khan | **অনুমতি দরকার** — translator/publisher permission not verified; used under non-commercial religious/educational terms pending verification |
| `en.sahih` | Saheeh International | **অনুমতি দরকার** — translator/publisher permission not verified; used under non-commercial religious/educational terms pending verification |
| `ur.ahmedali` | Ahmed Ali | **অনুমতি দরকার** — translator/publisher permission not verified; used under non-commercial religious/educational terms pending verification |
| `hi.hindi` | Suhel Farooq Khan and Saifur Rahman Nadwi | **অনুমতি দরকার** — translator/publisher permission not verified; used under non-commercial religious/educational terms pending verification |
| `id.indonesian` | Translator not named by the source API | **অনুমতি দরকার** — translator/publisher permission not verified; used under non-commercial religious/educational terms pending verification |
| `ar.alafasy` (audio URLs) | Mishary Rashid Alafasy recitation, streamed from `cdn.islamic.network` | URLs only (hotlink, as in production today); audio files not redistributed |

> **Commit gate:** translation files whose permission is marked "অনুমতি দরকার" must NOT be
> committed until the owner confirms. (Owner decision pending — 2026-10-15.)

## Data hygiene

- Arabic (`quran-uthmani`): **no Unicode normalization ever applied**; only a leading U+FEFF
  BOM is stripped (1 occurrence: surah 1, ayah 1).
- Translations: only U+FEFF (BOM) and U+200B (zero-width space) are stripped.
- U+200C (ZWNJ), U+200D (ZWJ), U+2060 and U+200A are never auto-removed — valid in
  Bengali/Urdu orthography and Arabic text.
- `editions.json` records per-edition ayah counts and stripped-character counts.

## Refreshing

Re-run `node scripts/download-quran-editions.mjs` to refresh, then
`node scripts/verify-quran-dataset.mjs` to validate. Commit the result.
Do not hand-edit ayah text — corrections must come from the upstream source
so the dataset stays reproducible.
