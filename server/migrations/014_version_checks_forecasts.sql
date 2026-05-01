CREATE TABLE IF NOT EXISTS siteguide_version_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkedAt TEXT NOT NULL,
  detectedVersion TEXT,
  previousVersion TEXT,
  changed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE IF NOT EXISTS extended_forecasts (
  id TEXT PRIMARY KEY DEFAULT 'extended_grid',
  gridData TEXT,
  fetchedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS site_extended_forecasts (
  siteId TEXT PRIMARY KEY,
  forecastData TEXT,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
