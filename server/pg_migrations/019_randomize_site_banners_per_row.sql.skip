-- Randomize site banners properly per-row
-- Migration 018 assigned the same banner to all sites of each category because
-- the scalar subquery was evaluated once for the whole UPDATE.
-- This migration uses ROW_NUMBER() with random ordering to pair each site
-- with a unique random banner.

WITH library_data AS (
  SELECT value::jsonb AS lib
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
  SELECT banner, ROW_NUMBER() OVER (ORDER BY random()) AS rn,
         COUNT(*) OVER () AS total
  FROM all_images
  WHERE category IS NULL OR category = 'coastal'
),
inland_images AS (
  SELECT banner, ROW_NUMBER() OVER (ORDER BY random()) AS rn,
         COUNT(*) OVER () AS total
  FROM all_images
  WHERE category IS NULL OR category = 'inland'
),
sites_ranked AS (
  SELECT id, type,
         CASE
           WHEN lower(coalesce(type, '')) ~ 'inland|mountain|ridge|tow' THEN 'inland'
           ELSE 'coastal'
         END AS site_category,
         ROW_NUMBER() OVER (
           PARTITION BY CASE
             WHEN lower(coalesce(type, '')) ~ 'inland|mountain|ridge|tow' THEN 'inland'
             ELSE 'coastal'
           END
           ORDER BY random()
         ) AS site_rn
  FROM sites
)
UPDATE sites s
SET image = COALESCE(
  CASE sr.site_category
    WHEN 'inland' THEN (SELECT banner FROM inland_images WHERE rn = ((sr.site_rn - 1) % (SELECT total FROM inland_images LIMIT 1)) + 1)
    ELSE (SELECT banner FROM coastal_images WHERE rn = ((sr.site_rn - 1) % (SELECT total FROM coastal_images LIMIT 1)) + 1)
  END,
  s.image
)
FROM sites_ranked sr
WHERE s.id = sr.id;
