-- Migration 014: Populate site banners with random images from library
-- Uses PostgreSQL JSON functions to parse library and assign banners by category

WITH library_data AS (
  SELECT value::jsonb AS lib
  FROM settings
  WHERE key = 'imageLibrary'
),
coastal_images AS (
  SELECT jsonb_array_elements(lib) ->> 'banner' AS banner
  FROM library_data,
  jsonb_array_elements(lib) AS elem
  WHERE (elem ->> 'category' IS NULL OR elem ->> 'category' = 'coastal')
    AND (elem ->> 'banner') IS NOT NULL
),
inland_images AS (
  SELECT jsonb_array_elements(lib) ->> 'banner' AS banner
  FROM library_data,
  jsonb_array_elements(lib) AS elem
  WHERE (elem ->> 'category' = 'inland' OR elem ->> 'category' IS NULL)
    AND (elem ->> 'banner') IS NOT NULL
)
UPDATE sites
SET image = CASE
  WHEN lower(coalesce(type, '')) ~ 'inland|mountain|ridge|tow' THEN
    (ARRAY(SELECT banner FROM inland_images ORDER BY random() LIMIT 1))[1]
  ELSE
    (ARRAY(SELECT banner FROM coastal_images ORDER BY random() LIMIT 1))[1]
END
WHERE image IS NULL OR image = '';
