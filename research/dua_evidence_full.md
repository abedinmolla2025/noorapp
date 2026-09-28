# Dua Phase 6 — Full Per-Claim Evidence Research (2026-09-28)

160/160 records re-read live (read-only) and each virtue claim checked against its cited source.

## Counts

- **SUPPORTED: 0**
- **PARTIALLY_SUPPORTED: 108**
- **UNSUPPORTED: 0**
- **TEMPLATE: 52**
- **CONFLICTING: 0**
- **REQUIRES_REVIEW: 0**

## Key findings

1. **52 TEMPLATE** — identical template filler; cited reference supports no specific virtue claim. Safe action: suppress (null virtue + virtue_reference). Matches the prior 52 exactly.
2. **19 PARTIALLY_SUPPORTED (reference-fix)** — claim 'Allah loves those who repent and return to Him sincerely' is a genuine Quranic teaching but from **2:222**, not the cited **40:60**. Safe action: correct virtue_reference to Quran 2:222. (Batch agents mislabeled these SUPPORTED; adjudicated.)
3. **89 PARTIALLY_SUPPORTED (interpretation)** — generic virtue wordings ('Dua relieves burden...', 'Sincere reliance brings protection...') cited to 40:60. The verse establishes Allah's response to supplication; the specific benefit wording is interpretation, not verse text. Distinction recorded per claim; safe action: keep suppressed per prior render-layer decision (no invented replacement).
4. **0 fully SUPPORTED** — no virtue claim was verified word-for-word against its exact cited source; honest zero rather than inflated.
5. **0 CONFLICTING / 0 REQUIRES_REVIEW** — no contradictory evidence found; every record reached a determination.

## DB status

All cleanup remains proposal-only: `research/dua_cleanup_migration.sql`. RLS-blocked; no writes attempted. Render-layer suppression stays active.
