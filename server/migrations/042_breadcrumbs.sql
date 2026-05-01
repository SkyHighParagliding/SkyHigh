CREATE TABLE IF NOT EXISTS breadcrumbs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flightId TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  altitude REAL DEFAULT 0,
  speed REAL DEFAULT 0,
  heading REAL DEFAULT 0,
  synced INTEGER DEFAULT 1,
  FOREIGN KEY (flightId) REFERENCES flights(id)
);
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_flight ON breadcrumbs(flightId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_breadcrumbs_flight_ts ON breadcrumbs(flightId, timestamp);
