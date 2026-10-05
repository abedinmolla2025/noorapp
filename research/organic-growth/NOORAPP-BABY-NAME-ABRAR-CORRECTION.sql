-- NOORAPP — Baby-name record correction: 'ABRAR MOLLA' -> 'Abrar'
-- Single-record, fail-closed UPDATE. Run in the Supabase dashboard SQL editor.
--
-- Guards: matches ONLY the one record by id + content_type + current title.
-- If the title was already changed (or the id is wrong), this updates 0 rows.
-- Only the title column changes. Meanings, Arabic, category, slug (empty) untouched.

UPDATE admin_content
SET title = 'Abrar'
WHERE id = '91989171-77eb-4094-8bca-8db8a81bafcf'
  AND content_type = 'name'
  AND title = 'ABRAR MOLLA';

-- Read-back verification (expect exactly 1 row, title = 'Abrar'):
SELECT id, title, title_arabic, category, content_en
FROM admin_content
WHERE id = '91989171-77eb-4094-8bca-8db8a81bafcf';
