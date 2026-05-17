-- Fix existing sites with broken /uploads/ image paths
-- These paths don't exist in production and break image display

UPDATE sites
SET image = ''
WHERE image LIKE '/uploads/%';

-- Verify the update
-- SELECT COUNT(*) as fixed_count FROM sites WHERE image = '';
