-- Populate site banners with random images from library (v2)
-- Fixes bugs in migration 014:
-- 1. Cartesian product bug in CTE (using both library_data and jsonb_array_elements as table reference)
-- 2. Empty banner strings were being included as valid options
-- 3. Uses correct working R2 bucket URLs

WITH library_data AS (
  SELECT CAST(value AS jsonb) AS lib
  FROM settings
  WHERE key = 'imageLibrary'
),
all_images AS (
  SELECT
    elem ->> 'banner' AS banner,
    elem ->> 'category' AS category
  FROM library_data,
  jsonb_array_elements(lib) AS elem
  WHERE (elem ->> 'banner') IS NOT NULL
    AND (elem ->> 'banner') != ''
),
coastal_images AS (
  SELECT banner FROM all_images
  WHERE category IS NULL OR category = 'coastal'
),
inland_images AS (
  SELECT banner FROM all_images
  WHERE category IS NULL OR category = 'inland'
)
UPDATE sites
SET image = CASE
  WHEN lower(coalesce(type, '')) ~ 'inland|mountain|ridge|tow' THEN
    (SELECT banner FROM inland_images ORDER BY random() LIMIT 1)
  ELSE
    (SELECT banner FROM coastal_images ORDER BY random() LIMIT 1)
END
WHERE image IS NULL OR image = '';
