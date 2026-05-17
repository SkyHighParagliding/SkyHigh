-- Fix image library URLs to use correct R2 public domain
-- Old domain: pub-d31362da23d54f83bb50efb9194c6b87.r2.dev (incorrect/outdated)
-- New domain: pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev (correct public endpoint)

UPDATE settings
SET value = REPLACE(
  value,
  'pub-d31362da23d54f83bb50efb9194c6b87.r2.dev',
  'pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev'
)
WHERE key = 'imageLibrary'
  AND value LIKE '%pub-d31362da23d54f83bb50efb9194c6b87.r2.dev%';
