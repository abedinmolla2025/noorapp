-- Optional screenshots submitted with public support tickets.
-- Files are stored under a random support/ path and are not listed anywhere in the UI.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-attachments',
  'contact-attachments',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can upload support screenshots" ON storage.objects;
CREATE POLICY "Anyone can upload support screenshots"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'contact-attachments'
  AND name LIKE 'support/%'
);

DROP POLICY IF EXISTS "Public can view support screenshots" ON storage.objects;
CREATE POLICY "Public can view support screenshots"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'contact-attachments');
