CREATE TABLE IF NOT EXISTS emergency_hospitals_cache (
  siteId TEXT PRIMARY KEY,
  hospitals TEXT NOT NULL DEFAULT '[]',
  cachedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
