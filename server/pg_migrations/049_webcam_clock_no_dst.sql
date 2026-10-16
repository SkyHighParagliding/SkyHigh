-- Per-camera "clock ignores daylight saving" switch. A camera flagged true has
-- a clock that stays on standard time all year, so its wall-clock capture times
-- are read at the zone's standard offset instead of the DST-aware one. Existing
-- frames are re-timed in code (server/webcams/restamp.ts), not here.
-- Flowerdale North is not on daylight saving; South is.
ALTER TABLE webcam_sources ADD COLUMN IF NOT EXISTS "clockNoDst" JSONB NOT NULL DEFAULT '{"north": false, "south": false}'::jsonb;

UPDATE webcam_sources SET "clockNoDst" = '{"north": true, "south": false}'::jsonb
WHERE "siteId" = 'three-sisters-flowerdale';
