# Audit Verification Policy

## Purpose

This policy prevents historical audit notes from being reported as current production facts.

## Source-of-truth rules

1. **Live production data is authoritative** for counts, availability, routes, and user-visible claims. Verify it at audit time.
2. Repository JSON, migration files, reports, and Markdown notes are **evidence or historical context only**, unless their freshness and relation to production are explicitly verified.
3. Every numeric claim in an audit must include:
   - the exact source file, endpoint, or database query;
   - the verification timestamp;
   - whether the value is local, fallback, staging, or production;
   - the counting method and any duplicate-handling rule.
4. If two sources disagree, do not choose silently. Report both values, identify which is authoritative, investigate the discrepancy, and label stale values as historical.
5. Before publishing an audit, search the draft for every number and every phrase such as `current`, `live`, `production`, `total`, or `count`, then trace each claim to its evidence.
6. A historical finding must never be repeated without a label such as **historical snapshot** or **not verified in current production**.

## Quiz-specific checks

For quiz counts, verify all of the following separately:

- bundled/fallback dataset count;
- live production dataset count;
- unique question-key count;
- duplicate groups;
- the source code path used by the public quiz page.

The public claim should be compared with the live production count, not with the fallback JSON or an old audit note.

## Required audit record

Use this format for each material numeric finding:

| Field | Required value |
|---|---|
| Claim | The exact statement being made |
| Source | URL, file, query, or command |
| Environment | Production, local, fallback, staging, or historical |
| Verified at | ISO 8601 timestamp |
| Method | How the value was counted or tested |
| Result | Verified value |
| Conflicts | Any different value and why it differs |

## Current correction record

The previous `87 questions` statement came from a historical note and was not a current production count. It is superseded by the verified quiz merge evidence: **285 local records, 300 live records, 296 live unique keys, and four duplicate groups**. Future audits must not use the old figure without explicitly marking it as superseded historical data.
