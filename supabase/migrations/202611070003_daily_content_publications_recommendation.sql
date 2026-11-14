-- Daily Content: record which recommendation run a publication came from.
-- PREPARED ONLY — DO NOT APPLY without a separate owner approval.
-- Phase 9 (AI mission): the daily planner consumes approved recommendation
-- runs; the edge writes the run id into this column on every publication
-- insert (planned and failed rows alike) so the provenance of every plan
-- is auditable from the publications table alone. NULL means the plan was
-- seeded (no approved run existed for the date).
--
-- DEPLOY ORDER (hard requirement): apply this migration BEFORE deploying
-- the edge function that writes the column. The edge inserts
-- recommendation_id on every planned/failed row; against a database
-- without the column the insert errors and the day fails with a 500
-- (fail-closed, but the day is lost). The Phase 11 deployment package
-- must list this migration first.
-- Nullable: existing rows (all seeded, all failed/planned so far) are
-- untouched. No RLS change: the column is a uuid, not sensitive — the
-- run id is already visible through the approved-runs public policy.

alter table public.daily_content_publications
  add column if not exists recommendation_id uuid;
