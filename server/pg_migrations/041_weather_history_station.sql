ALTER TABLE weather_history ADD COLUMN IF NOT EXISTS "stationName" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS idx_weather_history_site_time;
CREATE INDEX IF NOT EXISTS idx_weather_history_site_station_time ON weather_history ("siteId", "stationName", timestamp DESC);
