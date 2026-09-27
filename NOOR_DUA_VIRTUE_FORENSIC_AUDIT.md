# NOOR DUA VIRTUE FORENSIC AUDIT

**Date:** 2026-09-27 · **Phase:** A3 · **Scope:** all 218 published dua records in Supabase `admin_content` (`content_type='dua'`, `status='published'`)
**Method:** full-table read via API (read-only); backup at `.backups/dua-virtue-backup-2026-09-27.json`. No sampling — every row examined.

## Findings

### 1. Only 8 distinct virtue texts exist across 218 records

| # | Virtue text (exact) | Rows | virtue_reference |
|---|---|---|---|
| 1 | *(empty)* | 60 | — |
| 2 | "Dua relieves burden by turning the heart fully to Allah." | 58 | "Quran 40:60" (all 58) |
| 3 | "This dua reconnects the heart to Allah in moments of need and uncertainty." | 50 | the dua's own source ref (50 distinct) |
| 4 | "Sincere reliance on Allah brings protection and tranquility to the heart." | 26 | "Quran 40:60" (all 26) |
| 5 | "Allah loves those who repent and return to Him sincerely." | 19 | "Quran 40:60" (all 19) |
| 6 | "Provision is from Allah; dua aligns effort with trust in Him." | 2 | "Quran 40:60" (both) |
| 7 | "Dua in hardship strengthens patience and dependence on Allah." | 1 | "Quran 40:60" |
| 8 | "Night remembrance guards the heart and deepens trust." | 1 | "Quran 40:60" |
| 9 | "Remembering Allah in travel brings safety and gratitude." | 1 | "Quran 40:60" |

### 2. The reference pattern is the smoking gun

- **110 of 158 virtue-carrying rows share the identical `virtue_reference`: "Quran 40:60"** — a general verse about supplication ("Call upon Me; I will respond to you"), not a virtue narration for any specific dua. It is pasted across unrelated duas as decoration.
- The other 48 references are the **dua's own source** copied into the virtue field (e.g. virtue_reference "Surah An-Nahl 16:97" where the dua itself is from An-Nahl 16:97) — at least one row mismatches its own source (virtue_reference "Sahih al-Bukhari 2893" vs the dua's reference "Sahih al-Bukhari 6369").
- **Zero** virtue texts are transmitted virtues (no "the Prophet ﷺ said whoever recites X…" narration anywhere). All 8 are generic English devotional one-liners, rendered on Bangla pages under the heading ✨ ফজিলত ("Virtue") — a heading that implies religious merit.
- Language mismatch: English template sentences on Bangla pages.

### 3. Classification (per work-order rubric)

- **A = directly supported by specific source/reference: 0 rows.** No virtue text is backed by a specific virtue narration.
- **B = reasonable editorial explanation clearly labeled as editorial: 0 rows.** None are labeled editorial; all sit under the "Virtue" heading.
- **C = unsupported/general claim: 158 rows.** Generic devotional claims with no supporting narration; references are either a pasted general verse or the dua's own source.
- **D = duplicate/template claim: 158 rows.** All drawn from an 8-text template pool; 110 share one identical reference.

### 4. Remediation (per work order: remove C/D, never invent replacements)

- Action: set `virtue = ''` and `virtue_reference = ''` on the 158 C/D rows (matching the existing empty-string convention used by the 60 already-empty rows).
- Untouched: the 60 rows already empty; all other columns (`arabic`, `pronunciation`, `translation_bn`, `reference`, `authenticity`, `benefits_*`, `explanation`, etc.).
- The prerender and the SPA both render the fazilat section only when virtue text is non-empty, so nulling removes the section cleanly with no template change.

## Before → after counts

| Metric | Before | After |
|---|---|---|
| Rows with virtue text | 158 | 158 — **DB WRITE BLOCKED (see below)** |
| Unique non-empty virtue texts | 8 | 8 — **DB WRITE BLOCKED** |
| Rows sharing "Quran 40:60" as virtue_reference | 110 | 110 — **DB WRITE BLOCKED** |
| Source-backed virtues (class A) | 0 | 0 |
| Unsupported claims removed | — | 0 (blocked) |
| Generic filler introduced | — | 0 |

## BLOCKED: database write requires privileged access

**What was tried:** `PATCH /rest/v1/admin_content` setting `virtue=''` / `virtue_reference=''` on the 158 C/D rows, using the connected Supabase credential — the same credential/method that succeeded for the 5-story pilot `metadata` backfill.

**Result:** HTTP 200 with `[]` (zero rows affected), verified by re-read: the UPDATE is silently filtered by the row-level security policy for these columns (a no-op PATCH writing the current value back also returns 0 rows, proving it is a policy filter, not a no-change optimization). Full read access works; writes to `virtue`/`virtue_reference` do not.

**Exact requirement:** run the remediation SQL below with a privileged role (Supabase SQL editor / service_role) — the same path used for the pilot backfill. The backup file `.backups/dua-virtue-backup-2026-09-27.json` (218 rows, 9 columns) is retained regardless.

```sql
-- 0) BACKUP (run first; keep the table)
CREATE TABLE admin_content_virtue_backup_20260927 AS
SELECT id, slug, virtue, virtue_reference
FROM admin_content
WHERE content_type = 'dua' AND status = 'published';

-- 1) REMEDIATE: remove unsupported templated virtues (expect 158 rows)
UPDATE admin_content
SET virtue = '', virtue_reference = ''
WHERE content_type = 'dua'
  AND status = 'published'
  AND virtue IS NOT NULL
  AND btrim(virtue) <> '';

-- 2) VERIFY (both must return 0)
SELECT count(*) AS rows_still_with_virtue
FROM admin_content
WHERE content_type = 'dua' AND status = 'published'
  AND btrim(COALESCE(virtue, '')) <> '';

SELECT count(*) AS rows_still_with_virtue_ref
FROM admin_content
WHERE content_type = 'dua' AND status = 'published'
  AND btrim(COALESCE(virtue_reference, '')) <> '';
```

**Rollback (if ever needed):**
```sql
UPDATE admin_content d
SET virtue = b.virtue, virtue_reference = b.virtue_reference
FROM admin_content_virtue_backup_20260927 b
WHERE d.id = b.id;
```

**Code/template impact of the (pending) write:** none required. Both the prerender (`api/prerender.js` dua branch) and the SPA (`DuaDetailPage.tsx`) render the ✨ ফজিলত section only when virtue text is non-empty — the 60 already-empty rows prove the template handles absence cleanly. After the SQL runs, re-fetch production `/dua/<slug>` pages to confirm the section is gone.
