# Data Attribution — Noor App (noorapp.in)

Where every religious text in the app comes from, who translated it, and what
we know about reuse permission. **Nothing here is guessed**: any cell we could
not verify says "অনিশ্চিত / অনুমতি দরকার" (uncertain / permission needed).

> AdSense-review note (2026-10-15): the app fetches Quran text and translations
> at runtime from the AlQuran Cloud API. No local vendored Quran dataset is in
> use on this branch. This document describes the live data sources.

## Quran — editions served at runtime (AlQuran Cloud API)

| Edition code | Language | Translator | Source | License / terms | Commercial use | Source link |
|---|---|---|---|---|---|---|
| `quran-uthmani` (SSR) / `ar.alafasy` (SPA) | Arabic | — (Uthmani text) | Tanzil project, via AlQuran Cloud | Tanzil terms apply; text kept **unmodified** | অনিশ্চিত / অনুমতি দরকার | https://tanzil.net |
| `bn.bengali` | Bengali | Muhiuddin Khan | AlQuran Cloud | Translator/publisher terms apply | অনিশ্চিত / অনুমতি দরকার | https://alquran.cloud |
| `en.sahih` | English | Saheeh International | AlQuran Cloud | Translator/publisher terms apply | অনিশ্চিত / অনুমতি দরকার | https://alquran.cloud |
| `ur.ahmedali` | Urdu | Ahmed Ali | AlQuran Cloud | Translator/publisher terms apply | অনিশ্চিত / অনুমতি দরকার | https://alquran.cloud |

Notes:
- The Arabic Uthmani text originates from the **Tanzil project** — https://tanzil.net
  is cited as the source wherever the Arabic text is attributed (reader footer,
  /sources page, surah-intro source lists). The text is never modified.
- Translation collections redistributed by AlQuran Cloud-style aggregators are
  generally offered for **non-commercial** religious/educational use; commercial
  use requires the translator's/publisher's permission. Noor App has **not**
  verified individual translator permissions — hence "অনিশ্চিত / অনুমতি দরকার".

## Hadith — Sahih al-Bukhari (bn / en / ur)

| Language | Translator / publisher | Source | License / terms | Commercial use |
|---|---|---|---|---|
| Bengali | **[নাম দরকার — owner to provide]** | App dataset (Supabase `hadiths` / static JSON) | অনিশ্চিত | অনিশ্চিত / অনুমতি দরকার |
| English | **[নাম দরকার — owner to provide]** | App dataset | অনিশ্চিত | অনিশ্চিত / অনুমতি দরকার |
| Urdu | **[নাম দরকার — owner to provide]** | App dataset (`public/data/sahih_bukhari_ur.json`) | অনিশ্চিত | অনিশ্চিত / অনুমতি দরকার |

The /sources page carries the same placeholder. The owner must supply the
translator and publisher names for each language; this table is updated then.

## Dua

| Content | Source | License / terms |
|---|---|---|
| Dua Arabic text & translations | App dataset (`public/data/duas.json`, Supabase `admin_content`) | Compiled by the Noor App editorial team; classical dua texts are public religious heritage |

## What the owner still needs to provide

1. Bengali Sahih al-Bukhari **translator name + publisher** (for /sources + this file).
2. English Sahih al-Bukhari **translator name + publisher**.
3. Urdu Sahih al-Bukhari **translator name + publisher**.
4. Confirmation (or correction) of the Quran translators listed above.
5. Whether any translation is used under a written permission — if yes, the permission
   reference to cite.
