-- Revert imageLibrary to use the working R2 bucket
-- The OLD bucket (pub-d31362da23d54f83bb50efb9194c6b87.r2.dev) still works and contains all original images
-- The NEW bucket (pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev) was created for Railway but doesn't have these files
-- This migration undoes the incorrect domain rewrite from migration 015/016

UPDATE settings
SET value = REPLACE(value::text, 'pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev', 'pub-d31362da23d54f83bb50efb9194c6b87.r2.dev')
WHERE key = 'imageLibrary'
  AND value::text LIKE '%pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev%';

-- Also fix homeHeroImages which would have been affected
UPDATE settings
SET value = REPLACE(value::text, 'pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev', 'pub-d31362da23d54f83bb50efb9194c6b87.r2.dev')
WHERE key = 'homeHeroImages'
  AND value::text LIKE '%pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev%';

-- Fix any site images that may have been overwritten
UPDATE sites
SET image = REPLACE(image, 'pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev', 'pub-d31362da23d54f83bb50efb9194c6b87.r2.dev')
WHERE image LIKE '%pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev%';
