# Migration / RLS Verification Checklist

Migration file: `supabase/migrations/202611030001_daily_content.sql`
(REVIEW ONLY — do not apply without a separate explicit approval;
do not modify during launch; if it must change, stop and re-review.)

Correction note: this checklist reflects the Option C–corrected
migration (all four admin policies use
`public.is_admin(auth.uid())`; corrected file md5
`7dd7f00aaab4cb668c72e4cf8bbed062`). The superseded
email-list-based instructions have been removed from this
checklist; do not follow any older copy that still describes them.

How to use this checklist: work top to bottom in production AFTER
the migration is approved and applied. Each item is marked with its
evidence bucket. "Confirmed from repository" items were verified by
reading the migration and related migrations locally. "Requires
production verification" items cannot be confirmed without a
production read. "Requires an owner decision" items need the owner
to choose, not just to verify.

## A. Tables and columns — Confirmed from repository

- [ ] `daily_content_settings`: `id int PK default 1 check (id = 1)`,
      `enabled boolean NOT NULL default false`,
      `updated_at timestamptz NOT NULL default now()`.
- [ ] `daily_content_publications`: `id uuid PK default
      gen_random_uuid()`, `kolkata_date date NOT NULL UNIQUE`,
      `status text NOT NULL default 'planned' CHECK (planned,
      published, failed)`, `hadith_ref text`,
      `hadith_source_line text`, `cards jsonb NOT NULL default []`,
      `push jsonb` (nullable — a corrupt row is a planned row with
      NULL push), `hadith_cycle int NOT NULL default 1`,
      `card_cycle int NOT NULL default 1`, `recipients_total /
      recipients_sent / recipients_failed int NOT NULL default 0`,
      `error text`, `created_at timestamptz NOT NULL default now()`,
      `published_at timestamptz` (nullable).
- [ ] `daily_content_deliveries`: `id uuid PK default
      gen_random_uuid()`, `publication_id uuid NOT NULL REFERENCES
      publications(id) ON DELETE CASCADE`, `token_id uuid REFERENCES
      device_push_tokens(id) ON DELETE SET NULL`,
      `device_id text` (NULLABLE — see §E), `platform text NOT NULL
      default 'web'`, `status text NOT NULL default 'pending' CHECK
      (pending, sent, failed, retryable, disabled)`,
      `attempts int NOT NULL default 0`,
      `max_attempts int NOT NULL default 4`, `error text`,
      `next_attempt_at timestamptz` (nullable — a NULL value with
      status retryable is stranded by the due-time filter, never
      sent), `created_at / updated_at timestamptz NOT NULL default
      now()`.
- [ ] `daily_content_preferences`: `device_id text PK`,
      `daily_enabled boolean NOT NULL default true`,
      `updated_at timestamptz NOT NULL default now()`.
- [ ] Index `idx_daily_pub_date` on publications
      (`kolkata_date desc`); partial index `idx_daily_deliv_retry`
      on deliveries (`status, next_attempt_at`) where
      `status = 'retryable'`.

## B. Unique constraints and foreign keys — Confirmed from repository

- [ ] UNIQUE `kolkata_date` on publications: one publication per
      Asia/Kolkata date, enforced by the database.
- [ ] UNIQUE (`publication_id`, `device_id`) on deliveries: one
      delivery per device per publication — the "max one daily
      notification per user" cap, enforced by the database.
- [ ] FK publication → publications ON DELETE CASCADE: deleting a
      publication deletes its deliveries (rollback never deletes
      publications — see the rollback plan).
- [ ] FK token → device_push_tokens ON DELETE SET NULL: deleting a
      token nulls the delivery's token_id (the delivery then cannot
      be retried via token lookup — it is stranded, not sent).

## C. RLS and policies — Confirmed from repository (structure)

- [ ] RLS enabled on all four tables.
- [ ] Public access: SELECT on publications with
      `status = 'published'` ONLY. No other table has a public policy.
- [ ] No public write access on any table (no INSERT/UPDATE/DELETE
      policy for `public`/`anon`/`authenticated` without an admin
      check).
- [ ] Admin policies (all keyed on
      `public.is_admin(auth.uid())`): settings full access FOR ALL
      with explicit USING and explicit WITH CHECK; publications
      read, deliveries read, preferences read (each FOR SELECT).
      No admin policy references any email-list table.
- [ ] Service-role policies (`auth.role() = 'service_role'`, full
      access) on all four tables — the edge function path.
- [ ] All policies are created idempotently (`IF NOT EXISTS` guards
      on `pg_policies`), and all tables `IF NOT EXISTS`: the
      migration is re-runnable.
- [ ] Seed: `INSERT settings (1, false) ON CONFLICT DO NOTHING` —
      the system starts PAUSED. Verify the seed row exists and reads
      `enabled = false` after applying.

## D. Requires production verification

- [ ] `public.is_admin(uuid)` EXISTS in production (SECURITY
      DEFINER, owner `postgres`) and `public.user_roles` contains at
      least one admin/super_admin row (owner-reported 2026-11-04;
      re-confirm at apply time if the owner wishes). No email-list
      admin table is required, and its existence is NOT checked.
- [ ] Production `device_push_tokens` matches the repo schema from
      `20260212...sql`: UUID PK `id`, `device_id TEXT NOT NULL`,
      `token TEXT NOT NULL`, `platform` default `'web'`,
      `enabled BOOLEAN` default true, UNIQUE (`device_id`,
      `platform`). The edge reads `id, token, platform, device_id`
      (first send) and `token, enabled` by `id` (retry).
- [ ] The four tables were absent before applying (fresh apply), or
      any partial prior apply was inspected row-by-row before
      re-running — never assume a clean slate.
- [ ] After applying: list tables, constraints, RLS flags, and
      policies from production and compare each line against §A–§C
      and complete the §G matrix gate. Any mismatch → stop, do not
      deploy.

## E. Nullable device_id implications — Confirmed, with a decision

- [ ] `deliveries.device_id` is nullable by design in this migration
      (unchanged — the brief forbade migration changes here).
- [ ] Postgres UNIQUE treats NULLs as distinct, so NULL-device rows
      bypass the one-per-device cap. The edge now never creates
      NULL-device rows (NULL/empty/whitespace device_ids are skipped
      and counted at first send) and never sends them on the
      first-send path.
- [ ] Residual: a legacy NULL-device retryable row (created by
      another writer, or before the M3 fix) could still send via the
      runRetries token lookup. Bounded (one send per such row per
      tick cycle, only while retryable and due), but real.
- [ ] Owner decision (see REMAINING-APPROVALS.md): accept the
      residual, or approve a follow-up migration tightening the
      column (e.g. NOT NULL + backfill). No change is made here.

## F. Requires an owner decision

- [ ] Option C correction review: the migration's admin
      predicates were corrected to `public.is_admin(auth.uid())`
      (local change, awaiting owner review). Until that correction
      is approved, the migration must not be applied. The
      superseded email-list options (create it out-of-band, or a
      follow-up migration creating it) are closed and must not be
      followed. With the correction applied, admin reads work via
      `user_roles`; without it, admin policies cannot be created
      at all (the old predicate referenced a nonexistent table).
- [ ] Preferences client-write path: the migration intentionally
      opens no client write policy (comment: "launch follow-up").
      Decide: ship launch without a user-facing daily toggle, or
      approve the follow-up policy + UI work. Until then, opt-outs
      are recorded via service-role paths only, and users cannot opt
      out of daily pushes specifically (only push entirely).
- [ ] `deliveries.updated_at` has no refresh trigger (cosmetic only:
      the column exists but is never updated by the edge). Decide
      whether to add a trigger later; it affects nothing functional.

## G. Written intended grant set and 8-privilege verification matrix

### G1. Intended grant set (per table, per role)

Measured after apply with `has_table_privilege` for all eight
table privileges. `service_role` is out of this matrix: it accesses
via the service-role policies (and bypasses RLS as the backend
role); its privileges are not granted to client roles.

| Table | anon | authenticated | REFERENCES / TRUNCATE / TRIGGER / MAINTAIN (both roles) |
|---|---|---|---|
| `daily_content_settings` | — (no privilege) | SELECT, INSERT, UPDATE, DELETE | NONE |
| `daily_content_publications` | SELECT only (the published-only policy restricts it to `status = 'published'` rows) | SELECT | NONE |
| `daily_content_deliveries` | — (no privilege) | SELECT | NONE |
| `daily_content_preferences` | — (no privilege) | SELECT | NONE |

Rules:
- A grant and a policy are different things: the matrix measures
  GRANTS; the policies (§C) then restrict what each grant can do.
  Anon SELECT on publications is usable only for published rows
  because of the policy, not because the grant is limited.
- TRUNCATE and TRIGGER are NEVER intended for `anon` or
  `authenticated` on any of these tables (PostgREST cannot issue
  them). Any `true` value is a gate failure, without exception.
- REFERENCES and MAINTAIN are NOT intended for either role on any
  of these tables (no justification exists for them here).
- The intended set is per table as written above; it is never
  copied from a default ACL.

### G2. Matrix gate procedure (post-migration, read-only)

- For each of the four tables, measure all eight privileges
  (SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRUNCATE, TRIGGER,
  MAINTAIN) for `anon` and `authenticated` (32 cells).
- PASS: the measured matrix equals the §G1 intended set exactly.
- FAIL → STOP, do not deploy, if: any TRUNCATE or TRIGGER is true;
  any privilege outside the intended set is present; any intended
  privilege is missing.
- Note on defaults: tables created as `postgres` carry the
  `postgres` defaults (`arwdxm` for `anon`/`authenticated`) unless
  the apply path differs. The MEASURED matrix is authoritative —
  never assume the outcome from the defaults.
- Any permission narrowing needed to reach the intended set,
  including any REVOKE (and any GRANT), requires its own separate
  owner approval. It is not covered by the migration-apply approval
  or any other approval. Without that approval, the gate cannot be
  closed by changing permissions.
- After this gate passes, edge deployment proceeds per runbook
  Step 4 (`verify_jwt = false` specified explicitly).
