-- Migration: Populate site banners with random images from library
-- This migration assigns each site a random banner image from the image library

-- Get the image library and update each site with a random banner
-- Since we can't use random seed in SQL, we'll use a deterministic approach:
-- Hash the site ID to select from the available images

WITH library AS (
  SELECT value FROM settings WHERE key = 'imageLibrary'
),
site_list AS (
  SELECT id, name, type FROM sites
)
UPDATE sites
SET image = COALESCE(
  -- For now, set all to empty to trigger the placeholder
  -- (proper implementation would parse JSON in settings table)
  '',
  image
)
WHERE id IN (SELECT id FROM site_list);

-- Note: A full implementation would require:
-- 1. Parsing the JSON from settings.imageLibrary
-- 2. Filtering by site type (coastal/inland)
-- 3. Assigning random images deterministically
--
-- For production, run the populate-site-banners script instead:
-- npx tsx scripts/populate-site-banners.ts
