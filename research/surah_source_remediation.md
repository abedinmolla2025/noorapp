# Surah Introduction Source Remediation (2026-09-28)

Phase 9 finding: 31 of 95 published introductions carried VERIFIED claims whose
only non-repo sources were weak (Wikipedia, content-farm summaries, unvetted
mirrors). Remediation re-anchored every mechanical claim to two independent
primary APIs, verified live on 2026-09-28:

- **Quran.com Chapters API** (`api.quran.com/api/v4/chapters?language=en`, Quran Foundation) — name_simple, translated_name, revelation_place, verses_count
- **AlQuran Cloud Surah Metadata** (`api.alquran.cloud/v1/surah`, Islamic Network) — englishName, englishNameTranslation, revelationType, numberOfAyahs

Cross-check: revelation place and verse counts agree 100% across both primaries
for all 114 surahs. Name renderings in every published draft match at least one
primary. Exact API excerpts per surah are stored in
`research/surah_source_remediation.json`.

## Remediated entries (31)

- Surah 63: theme sentence dropped (only <2 strong sources).
- Surah 66: theme kept (≥2 strong sources).
- Surah 67: theme kept (≥2 strong sources).
- Surah 69: theme kept (≥2 strong sources).
- Surah 70: theme kept (≥2 strong sources).
- Surah 71: theme sentence dropped (only <2 strong sources).
- Surah 72: theme sentence dropped (only <2 strong sources).
- Surah 73: theme kept (≥2 strong sources).
- Surah 74: theme sentence dropped (only <2 strong sources).
- Surah 77: theme kept (≥2 strong sources).
- Surah 78: theme kept (≥2 strong sources).
- Surah 80: theme kept (≥2 strong sources).
- Surah 81: theme kept (≥2 strong sources).
- Surah 82: theme kept (≥2 strong sources).
- Surah 84: theme kept (≥2 strong sources).
- Surah 85: theme kept (≥2 strong sources).
- Surah 86: theme kept (≥2 strong sources).
- Surah 87: theme kept (≥2 strong sources).
- Surah 88: theme kept (≥2 strong sources).
- Surah 89: theme kept (≥2 strong sources).
- Surah 90: theme kept (≥2 strong sources).
- Surah 96: theme kept (≥2 strong sources).
- Surah 103: theme kept (≥2 strong sources).
- Surah 104: theme sentence dropped (only <2 strong sources).
- Surah 105: theme sentence dropped (only <2 strong sources).
- Surah 106: theme sentence dropped (only <2 strong sources).
- Surah 108: theme kept (≥2 strong sources).
- Surah 109: theme kept (≥2 strong sources).
- Surah 110: theme kept (≥2 strong sources).
- Surah 111: theme sentence dropped (only <2 strong sources).
- Surah 114: theme sentence dropped (only <2 strong sources).

## Weak sources stripped from other entries (10)

- Surah 1: removed Quranic Arabic Corpus (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 91: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 92: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 93: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 94: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 95: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 100: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 101: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).
- Surah 102: removed IslamicStudies.info - Towards (Qur'an text) (legitimate sources reinstated after regex review: Quranic Arabic Corpus on surah 1; IslamicStudies.info Towards-text on the 9 new entries).

## Result

- 104/104 published introductions now cite only strong sources, each with a
  `primary`/`secondary` type label for the Phase 10 transparency system.
- Zero weak sources remain in the published set.
- 9 introductions are now mechanical-only (name + classification + verse count)
  after honest theme trimming — no field was invented to fill the gap.
- Surah 96 keeps its first-revelation clause, now backed by Maududi (IIUM) +
  Sahih al-Bukhari 3 (sunnah.com).
