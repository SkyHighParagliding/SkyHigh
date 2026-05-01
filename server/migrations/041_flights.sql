CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  pilotId TEXT,
  sessionToken TEXT,
  siteId TEXT,
  siteName TEXT DEFAULT '',
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  endedAt DATETIME,
  status TEXT DEFAULT 'recording',
  maxAltitude REAL DEFAULT 0,
  maxSpeed REAL DEFAULT 0,
  totalDistance REAL DEFAULT 0,
  altitudeGain REAL DEFAULT 0,
  altitudeLoss REAL DEFAULT 0,
  FOREIGN KEY (pilotId) REFERENCES pilots(id)
);
CREATE INDEX IF NOT EXISTS idx_flights_pilot ON flights(pilotId);
CREATE INDEX IF NOT EXISTS idx_flights_session ON flights(sessionToken);
