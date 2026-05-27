CREATE TABLE IF NOT EXISTS pilot_sessions (
  token TEXT PRIMARY KEY,
  "pilotId" TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pilot_sessions_pilotid ON pilot_sessions ("pilotId");