CREATE TABLE IF NOT EXISTS site_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siteguideVersion TEXT NOT NULL,
  archivedAt TEXT NOT NULL,
  siteCount INTEGER NOT NULL DEFAULT 0,
  siteData TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_archives_version ON site_archives(siteguideVersion);
