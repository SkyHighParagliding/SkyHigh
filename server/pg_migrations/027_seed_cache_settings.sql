-- Migration 027: Seed cache timer settings
--
-- Source: server/migrations/052_cache_timer_settings.ts (legacy SQLite-only migration)
-- These settings configure cache TTLs for various data sources.
-- Not ported to the active PG migration set; this fills that gap.

INSERT INTO settings (key, value) VALUES ('cacheAdminSessionTtl', '24') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheTidyHqMemberTtl', '15') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheBomTideTtl', '6') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheAstroTideTtl', '30') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheTidyHqEventsTtl', '5') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheSearchContextTtl', '5') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheAssetRegisterTtl', '10') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cacheFreeFlightWxTtl', '30') ON CONFLICT (key) DO NOTHING;
