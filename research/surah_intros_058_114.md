# Surah Introduction Research — Surahs 58–114

Evidence-first research, 2026-09-28. Full claim→source records in
`surah_intros_058_114.json` (57 objects, one per surah). Read-only; nothing
published; nothing invented. English drafts only.

## Counts

| Overall status | Surahs | Count |
|---|---|---|
| VERIFIED | 58, 59, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90, 96, 103, 104, 105, 106, 108, 109, 110, 111, 114 | 39 |
| PARTIALLY_VERIFIED | 68, 91, 92, 93, 94, 95, 100, 101, 102 | 9 |
| CONFLICTING | 60, 76, 83, 97, 98, 99, 107, 112, 113 | 9 |
| UNVERIFIED | — | 0 |

- **VERIFIED drafts produced: 53** (every surah except the 4 with `NO PUBLISHABLE INTRODUCTION`).
- Surahs with `draft_en = null`: **60, 107, 112, 113** — revelation-status conflict with no safe wording; human editorial decision required.
- Surahs 76, 83, 97, 98, 99 are CONFLICTING overall but have drafts built **only from their
  VERIFIED claims** (name, verse count, ordinal position); the disputed Makki/Madani claim
  is deliberately omitted. Parent decision: publish without revelation status, or hold.

## What the drafts contain

Every draft is a short English paragraph grounded only in VERIFIED claims:
surah name + English meaning, revelation place (only when undisputed), verse count,
and a theme sentence only where the theme itself reached VERIFIED (e.g. 104, 105,
106, 111, 114, 98). No generic filler; categories with insufficient evidence were omitted.

## Notable conflicts (recorded with both sides quoted in the JSON)

- **60 Al-Mumtahana** — Medinan (Clear Quran, Tanzil) vs "revealed in Mecca" (Al-Islam.org Enlightening Commentary, EN+ES pages). No draft.
- **76 Al-Insaan** — Medinan (Wikipedia, Tafsir Namuneh citing Qurtubi "consensus") vs Makki (Maududi citing Zamakhshari/Razi/Baydawi/Nisaburi/Ibn Kathir/Alusi majority report, Ali Unal). Draft omits revelation status; repo data says Medinan (one side only) — not used to resolve.
- **83 Al-Mutaffifin** — Makki (Ibn Masud/most mushaf copies, Maududi, Wikipedia) vs Madani (Maariful Quran: Ibn Abbas, Qatadah, Muqatil, Dahhak; Nasa'i/Ibn Majah narration that it was the first surah revealed on arrival in Madinah). Draft omits revelation status.
- **97 Al-Qadr** — Maududi documents both camps each claiming the majority; quran.com says Mecca.
- **98 Al-Bayyinah** — Maududi: "where it was revealed, at Makkah or Madinah, is also disputed"; quran.com says Medina. Theme VERIFIED independently.
- **99 Az-Zalzalah** — Makki (Ibn Masud, Ata, Jabir, Mujahid, one Ibn Abbas report) vs Madani (Qatadah, Muqatil, another Ibn Abbas report); quran.com says Medina.
- **107 Al-Ma'un** — Makki (WikiShia, Wikipedia infobox; Ibn Abbas via Ibn Marduyah, Ata, Jabir) vs likely Medinan (Maududi: vv. 4–6 on hypocrites praying to be seen fit Medina, not Mecca). No draft.
- **112 Al-Ikhlas** — disputed Makki/Madani in the classical record itself; majority view Makkan but documented dispute. No draft.
- **113 Al-Falaq** — majority Meccan; a Maududi-summary source records a minority Madinan opinion. No draft.

Recorded minority views kept as notes (not conflicts): 95 (Qatadah + one Ibn Abbas report: Madani), 100 (Anas + Qatadah: Madani), 102 (some traditions: Madani); 73 v.20 and 77:48 have reported verse-level Madinan traditions without surah-level conflict.

## Verification standards

- VERIFIED = ≥2 independent reputable sources, exact excerpts, no conflicts; shared provenance noted (e.g. Tanzil-derived metadata; Maududi copies not double-counted; 96's first-revelation claim rests on Aishah's report via Bukhari/Muslim as explicitly affirmed by two independent commentaries, provenance disclosed).
- One reputable source = PARTIALLY_VERIFIED at best (e.g. 68's Tanzil verse-exception note; several single-source theme claims excluded from drafts).
- Name renderings (86 "The Night-Comer" vs repo "The Morning Star"; 64 "Mutual Loss and Gain" vs "Mutual Disillusion") were resolved toward the rendering with ≥2-source support; repo renderings that are standard but single-sourced in this pass were kept in notes, not asserted.
- Verse counts: no counting-tradition differences found for any of the 57; all match repo data (Kufan/Hafs numbering).
- Contaminated source text found in one quran.com search snippet (Al-Fajr) was discarded, not used.
