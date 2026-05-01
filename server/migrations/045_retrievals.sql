CREATE TABLE IF NOT EXISTS retrievals (
  id TEXT PRIMARY KEY,
  pilotId TEXT NOT NULL,
  pilotName TEXT NOT NULL DEFAULT '',
  pilotLat REAL,
  pilotLon REAL,
  pilotUpdatedAt INTEGER,
  driverId TEXT,
  driverName TEXT,
  driverLat REAL,
  driverLon REAL,
  driverUpdatedAt INTEGER,
  status TEXT NOT NULL DEFAULT 'awaiting',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME,
  flightId TEXT,
  FOREIGN KEY (pilotId) REFERENCES pilots(id)
);
CREATE INDEX IF NOT EXISTS idx_retrievals_pilot ON retrievals(pilotId);
CREATE INDEX IF NOT EXISTS idx_retrievals_status ON retrievals(status);
CREATE INDEX IF NOT EXISTS idx_retrievals_created ON retrievals(createdAt);
