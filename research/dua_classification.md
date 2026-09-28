# Dua virtue-claim classification — evidence-first research

Date: 2026-09-28
Inputs: `DUA_VIRTUE_CLEANUP_MANIFEST_2026-09-28.json` (full texts), `DUA_CLEANUP_FINAL_2026-09-28.csv`
Method: the 160 records reduce to **8 non-empty template texts + 1 empty residue**.
Each template's claim was researched against its cited reference by opening the
primary source (quran.com / quranx.com). VERIFIED = ≥2 independent reputable sources,
no conflicts, excerpts recorded. Nothing was invented; uncertainty was not converted
to certainty. Database was read-only throughout (RLS blocks writes; no write attempted).

## Counts

| Class | Meaning | Records |
|---|---|---|
| A — claim clearly supported | 19 | keep virtue, **correct citation** (40:60 → 2:222) |
| B — claim partially supported | 89 | leave unchanged, escalate to human/scholar |
| C — claim unsupported | 0 | — |
| D — generic/template claim | 52 | NULL out virtue + virtue_reference |
| E — source conflict | 0 | — |
| F — requires scholar verification | 0 | — |
| **Total** | | **160** |

Migration (`research/dua_cleanup_migration.sql`, proposal only, NOT executed):
- **52 records** in the NULL-out list
- **19 records** in the citation-correction list
- 89 records untouched (leave/escalate)

## Reasoning per template

### Quran 40:60 (verified text)
quran.com/40:60 — *"Your Lord has proclaimed, 'Call upon Me, I will respond to you.
Surely those who are too proud to worship Me will enter Hell, fully humbled.'"*
Ibn Kathir (abridged): *"Allah encourages His servants to call upon Him, and He
guarantees to respond."* This VERIFIEDLY supports: dua is worship; Allah invites
supplication and guarantees a response. It does **not** state burden relief,
protection/tranquility, love of the repentant, provision, patience, night remembrance,
or travel safety.

### T1 (B, 58 records) — "Dua relieves burden by turning the heart fully to Allah." ← Quran 40:60
Partially supported. The verse underlies "turning to Allah" (call upon Me; I will
respond), but "relieves burden" and "turning the heart fully" are interpretive
additions not stated in the verse. → leave unchanged, escalate.

### T2 (B, 26 records) — "Sincere reliance on Allah brings protection and tranquility to the heart." ← Quran 40:60
Partially supported. Reliance/calling on Allah is in the verse; "protection and
tranquility" as specific promised outcomes are not. → leave unchanged, escalate.

### T3 (A, 19 records) — "Allah loves those who repent and return to Him sincerely." ← Quran 40:60
**VERIFIED against Quran 2:222** (not 40:60):
1. quran.com/2:222 — *"Surely Allah loves those who always turn to Him in repentance
   and those who purify themselves."*
2. Pickthall via quranx.com/2.222 — *"Truly Allah loveth those who turn unto Him,
   and loveth those who have a care for cleanness."*

No conflicts. The current citation (40:60) is wrong for this claim — 40:60 says
nothing about Allah loving the repentant. Safe action: keep the virtue text,
correct `virtue_reference` to `Quran 2:222` (format matches existing style).
Verified live that `virtue_reference` is standalone (the dua's own source lives in
the separate `reference` column, e.g. "Surah Ibrahim 14:41"), so correcting it
touches nothing else.

### T4 (B, 2 records) — "Provision is from Allah; dua aligns effort with trust in Him." ← Quran 40:60
Partially supported. 40:60 says nothing about provision; only the generic "trust"
aligns with the verse's invitation. → leave unchanged, escalate.

### T5 (B, 1 record) — "Dua in hardship strengthens patience and dependence on Allah." ← Quran 40:60
Partially supported. "Dependence" aligns generically; "in hardship strengthens
patience" is not in the verse. → leave unchanged, escalate.

### T6 (B, 1 record) — "Night remembrance guards the heart and deepens trust." ← Quran 40:60
Partially supported. Nothing about night remembrance or guarding the heart in 40:60;
only generic reliance. → leave unchanged, escalate.

### T7 (B, 1 record) — "Remembering Allah in travel brings safety and gratitude." ← Quran 40:60
Partially supported. Nothing about travel or safety in 40:60; only generic
remembrance. → leave unchanged, escalate.

### T8 (D, 50 records) — "This dua reconnects the heart to Allah in moments of need and uncertainty." ← various
Generic/template claim. Identical emotional filler pasted across 50 unrelated duas;
verified live that `virtue_reference` merely duplicates each dua's own `reference`
(e.g. dua-for-faith-surah-an-nahl-16-97: both "Surah An-Nahl 16:97") — no claim was
ever derived from any cited text. → NULL out virtue + virtue_reference. The dua's
own source in `reference` is untouched by the migration.

### T9 (D, 2 records) — empty virtue ← "Quran 40:60"
Reference-only anomalies (dua-for-protection-surah-ghafir-40-9,
dua-for-protection-surah-aal-i-imraan-3-192): a dangling citation with no claim
text — template residue. → NULL out virtue_reference (virtue already empty).

## What the migration does NOT do
- Does not touch the 89 B-class records (partially supported claims need human/scholar judgment, not automatic deletion).
- Does not touch the dua's own source (`reference`), titles, content, or any other column.
- Does not weaken RLS or use any credential workaround.
- Is a proposal file only — nothing was executed.
