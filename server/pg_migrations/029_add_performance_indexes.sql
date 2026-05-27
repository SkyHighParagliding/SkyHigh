-- Migration 029: Add missing performance indexes
--
-- Source: server/migrations/050_add_performance_indexes.ts (legacy SQLite-only migration)
-- These indexes were never ported to PostgreSQL. PG already has:
--   - idx_contacts_email (from 001_full_schema.sql)
--   - idx_weather_obs_site (covers weather_observations("siteId") — same as idx_weather_observations_siteId)
-- No sessions table exists in PG (admin_sessions + pilot_sessions instead), so idx_sessions_* are skipped.
-- The remaining 17 indexes are added below.
--
-- Note: camelCase column names are double-quoted for PostgreSQL case sensitivity.

CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(type);
CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name);
CREATE INDEX IF NOT EXISTS idx_sites_useLiveWeather ON sites("useLiveWeather");

CREATE INDEX IF NOT EXISTS idx_contacts_organisation ON contacts(organisation);
CREATE INDEX IF NOT EXISTS idx_contacts_isCommittee ON contacts("isCommittee");
CREATE INDEX IF NOT EXISTS idx_contacts_displayCommittee ON contacts("displayCommittee");
CREATE INDEX IF NOT EXISTS idx_contacts_name_surname ON contacts(name, surname);

CREATE INDEX IF NOT EXISTS idx_news_date ON news("date" DESC);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);

CREATE INDEX IF NOT EXISTS idx_page_views_views ON page_views(views DESC);

CREATE INDEX IF NOT EXISTS idx_weather_observations_timestamp ON weather_observations(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_site_extended_forecasts_siteId ON site_extended_forecasts("siteId");

CREATE INDEX IF NOT EXISTS idx_wind_grid_data_siteId ON wind_grid_data("siteId");

CREATE INDEX IF NOT EXISTS idx_emergency_hospitals_cache_siteId ON emergency_hospitals_cache("siteId");

CREATE INDEX IF NOT EXISTS idx_procedures_sortOrder ON procedures("sortOrder");

CREATE INDEX IF NOT EXISTS idx_sites_lat_lon ON sites(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;
