-- Speed up the public Dua detail page lookups.
-- These indexes match the filters used by Dua detail and related navigation queries.
CREATE INDEX IF NOT EXISTS admin_content_dua_slug_status_idx
  ON public.admin_content (content_type, slug, status);

CREATE INDEX IF NOT EXISTS admin_content_dua_category_status_idx
  ON public.admin_content (content_type, status, category);

CREATE INDEX IF NOT EXISTS admin_content_dua_created_status_idx
  ON public.admin_content (content_type, status, created_at);
