CREATE TABLE IF NOT EXISTS weather_history (
  id          SERIAL PRIMARY KEY,
  "siteId"    TEXT NOT NULL,
  "windSpeed" INTEGER,
  "windGust"  INTEGER,
  direction   TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weather_history_site_time ON weather_history ("siteId", timestamp DESC);
