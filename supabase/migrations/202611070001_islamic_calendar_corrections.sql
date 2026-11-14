-- CANDIDATE A — S-8 remediation candidate (prepared 2026-11-08, closure mission).
-- NOT APPROVED. NOT APPLIED. Do not run without an explicit owner decision.
-- Change vs the approved 202611070001 (MD5 acde5794c4d34fc6c8632bf9128dd6e8):
-- exactly ONE line: the public SELECT policy changes from using (true)
-- to using (status = 'confirmed'), so proposed (unconfirmed) rows are
-- no longer publicly readable. Admin policy unchanged. If the owner
-- chooses this candidate, the Gate 1 package MD5 must be re-recorded
-- to this file's MD5 BEFORE any migration is applied (HARD GATE 0).

-- Islamic calendar corrections (moon-sighting adjustments).
--
-- PREPARED ONLY — DO NOT APPLY without a separate owner approval.
-- The calendar engine (src/lib/islamicCalendar) reads corrections as input
-- and works correctly with an empty set; applying this migration is NOT
-- required for the engine, the admin UI, or the tests.
--
-- Purpose: record local moon-sighting corrections so a calculated Hijri date
-- can be replaced by a locally confirmed one. One row per (hijri_year,
-- hijri_month). dayOffset -1 means the month started one day LATER than the
-- tabular calculation; +1 means one day EARLIER. Only rows with
-- status = 'confirmed' shift dates; 'proposed' rows are recorded but never
-- applied. Rows are never deleted — a wrong correction is superseded by a
-- newer row, preserving the audit history (created_by / created_at /
-- reason / source / status).
--
-- AI NEVER creates or confirms a correction. Corrections are entered by an
-- administrator from a sighting report.

create table if not exists public.islamic_calendar_corrections (
  id uuid primary key default gen_random_uuid(),
  hijri_year integer not null check (hijri_year between 1400 and 1500),
  hijri_month integer not null check (hijri_month between 1 and 12),
  day_offset integer not null check (day_offset in (-1, 0, 1)),
  reason_bn text not null,
  source text not null,
  status text not null default 'proposed' check (status in ('confirmed', 'proposed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (hijri_year, hijri_month)
);

alter table public.islamic_calendar_corrections enable row level security;

-- Public read: anyone may see which dates are confirmed and why.
drop policy if exists "Public can read calendar corrections" on public.islamic_calendar_corrections;
create policy "Public can read calendar corrections"
  on public.islamic_calendar_corrections
  for select
  using (status = 'confirmed');

-- Admin write: only admins (via the Option C is_admin check) may insert,
-- update, or delete correction rows.
drop policy if exists "Admins can manage calendar corrections" on public.islamic_calendar_corrections;
create policy "Admins can manage calendar corrections"
  on public.islamic_calendar_corrections
  for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
