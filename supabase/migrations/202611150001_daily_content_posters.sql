-- Daily Content posters — Storage bucket + publication poster columns.
--
-- REHEARSAL FIRST. Do NOT apply to production without a separate explicit
-- owner approval (see the Daily Content Master Mission, Phase 11/14).
-- This file is local; no production database is touched by writing it.
--
-- What this adds:
--  * Storage bucket `daily-content-posters` (public read) for the rendered
--    hero poster PNGs (one per publication date, per format). Uploads are
--    admin-only (`public.is_admin(auth.uid())`, same pattern as the `media`
--    bucket, migration 20260210162252). Public read lets the homepage,
--    push notifications and Facebook Page publication fetch the poster
--    URL without credentials.
--  * Poster columns on `daily_content_publications` (the finalized asset
--    record — Stage 3 of the 4-stage pipeline):
--      poster_asset_id     text      — stable asset ID `poster:<kolkata_date>`
--      poster_storage_path text      — bucket-qualified path
--                                      `daily-content-posters/<date>/<format>.png`
--      poster_url          text      — primary poster public URL (portrait 1080x1350)
--      poster_urls         jsonb     — format -> public URL map (all rendered formats)
--      poster_checksum     text      — SHA-256 hex of the primary (portrait) PNG
--      poster_checksums    jsonb     — format -> SHA-256 hex map
--      poster_scene_id     text      — background scene id (no-repeat vs yesterday)
--      poster_qc_status    text      — pending | passed | failed (NULL = never attempted)
--      poster_error        text      — short failure reason (no secrets, no tokens)
--      poster_generated_at timestamptz — when the poster was persisted
--    The poster URL is written ONLY after image QC passes (by the
--    `set_poster` action in the daily-content edge function). A failed
--    generation/QC never writes a poster URL — the publication stays
--    text-only instead of carrying a broken image.
--
-- D-1 backup scope note: the D-1 backup is a DATABASE dump only. Poster
-- PNG objects in Storage are NOT included in the D-1 backup artifact.
-- Posters are regenerable from the publication row (deterministic render),
-- so a Storage loss is recoverable by re-running the poster workflow —
-- but it is not covered by the database restore. Do not treat Storage
-- as backed up.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT / pg_policies
-- guards, same conventions as 202611030001_daily_content.sql).
-- No existing rows are modified; no RLS policy on the publications
-- table is changed (poster columns ride on the existing policies:
-- public reads published rows, service role writes).

-- ---------------------------------------------------------------------------
-- Storage bucket for daily-content posters.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('daily-content-posters', 'daily-content-posters', true, 10485760, array['image/png'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Daily posters are publicly readable') then
    create policy "Daily posters are publicly readable"
    on storage.objects for select
    using (bucket_id = 'daily-content-posters');
  end if;

  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Admins can upload daily posters') then
    create policy "Admins can upload daily posters"
    on storage.objects for insert
    with check (
      bucket_id = 'daily-content-posters'
      and public.is_admin(auth.uid())
    );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Admins can update daily posters') then
    create policy "Admins can update daily posters"
    on storage.objects for update
    using (
      bucket_id = 'daily-content-posters'
      and public.is_admin(auth.uid())
    );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Admins can delete daily posters') then
    create policy "Admins can delete daily posters"
    on storage.objects for delete
    using (
      bucket_id = 'daily-content-posters'
      and public.is_admin(auth.uid())
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Poster columns on daily_content_publications.
-- ---------------------------------------------------------------------------
alter table public.daily_content_publications
  add column if not exists poster_asset_id text,
  add column if not exists poster_storage_path text,
  add column if not exists poster_url text,
  add column if not exists poster_urls jsonb not null default '{}'::jsonb,
  add column if not exists poster_checksum text,
  add column if not exists poster_checksums jsonb not null default '{}'::jsonb,
  add column if not exists poster_scene_id text,
  add column if not exists poster_qc_status text
    check (poster_qc_status in ('pending', 'passed', 'failed')),
  add column if not exists poster_error text,
  add column if not exists poster_generated_at timestamptz;
