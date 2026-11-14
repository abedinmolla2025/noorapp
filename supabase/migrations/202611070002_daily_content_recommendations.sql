-- CANDIDATE — 070002 IDEMPOTENT VARIANT (prepared 2026-11-10, Phase 3).
-- NOT APPROVED. NOT APPLIED. Do not run without an explicit owner decision.
-- Change vs the approved 202611070002_daily_content_recommendations.sql
-- (MD5 22d8f3e551bd770758c1589a2c6093d0):
--   DROP POLICY IF EXISTS guards added before the two unguarded
--   CREATE POLICY statements ("Admins can manage recommendations" and
--   "Public can read approved recommendations"), so a re-run no-ops
--   instead of erroring with duplicate-policy (Postgres 42710).
-- Everything else is byte-identical to the approved original.
--
-- Daily Content recommendations (AI Context Engine, Phase 5).
-- PREPARED ONLY — DO NOT APPLY without a separate owner approval.
-- Wired in Phase 7 (admin review workflow). Phase 5's recommend function
-- is stateless and never writes here.
--
-- One row per recommendation run: the context the AI saw, the ranked
-- recommendations it returned (after server-side validation), what was
-- dropped and why, and the admin review outcome. The recommendations and
-- dropped columns store the validated JSON (references only — never Arabic
-- or Bengali religious text, never a grade, virtue, or ruling).
-- Rows are audit history: never delete, never update in place except the
-- review fields (status / reviewed_by / reviewed_at).

create table if not exists public.daily_content_recommendations (
  id uuid primary key default gen_random_uuid(),
  kolkata_date date not null,
  hijri_key text not null,
  context jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  dropped jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected')),
  created_by uuid,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  -- Admin's note on the review decision (reject reason, or an approve note).
  -- Never religious content; never AI-generated text.
  review_note text
);

alter table public.daily_content_recommendations enable row level security;

-- Admins can manage recommendation runs (the edge function writes through
-- the service role; this policy governs direct dashboard/client access).
-- Public read is allowed ONLY for approved runs (Phase 8: the homepage
-- shows the approved contextual plan). Pending and rejected runs stay
-- admin-only. This mirrors the publications policy (public read
-- published-only).
drop policy if exists "Admins can manage recommendations" on public.daily_content_recommendations;
create policy "Admins can manage recommendations"
  on public.daily_content_recommendations
  for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Public can read approved recommendations" on public.daily_content_recommendations;
create policy "Public can read approved recommendations"
  on public.daily_content_recommendations
  for select
  using (status = 'approved');

create index if not exists idx_daily_recs_date
  on public.daily_content_recommendations (kolkata_date desc);
create index if not exists idx_daily_recs_status
  on public.daily_content_recommendations (status);
