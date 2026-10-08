-- Camera archive. webcam_sources holds one row per site that has cameras
-- (feed location, polling/expectation windows, ingest health). webcam_frames
-- holds one row per ingested image; the JPEGs themselves live in R2 (or local
-- /uploads in dev) under "keyBase" + -thumb.jpg / -medium.jpg / -orig.jpg.
-- No image bytes are stored in Postgres.
CREATE TABLE IF NOT EXISTS webcam_sources (
  id SERIAL PRIMARY KEY,
  "siteId" TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'airportweathercams',
  "baseUrl" TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  "pollStartHour" INTEGER NOT NULL DEFAULT 5,
  "pollEndHour" INTEGER NOT NULL DEFAULT 19,
  "expectFromMin" INTEGER NOT NULL DEFAULT 360,
  "expectToMin" INTEGER NOT NULL DEFAULT 1100,
  "backfilledAt" TIMESTAMPTZ,
  "lastRunAt" TIMESTAMPTZ,
  "lastSuccessAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webcam_frames (
  id BIGSERIAL PRIMARY KEY,
  "sourceId" INTEGER NOT NULL REFERENCES webcam_sources(id) ON DELETE CASCADE,
  camera TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ NOT NULL,
  "localDay" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "keyBase" TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("sourceId", "sourcePath")
);

CREATE INDEX IF NOT EXISTS idx_webcam_frames_source_cam_time ON webcam_frames ("sourceId", camera, "capturedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_webcam_frames_source_day ON webcam_frames ("sourceId", "localDay", "capturedAt");
CREATE INDEX IF NOT EXISTS idx_webcam_frames_captured ON webcam_frames ("capturedAt");

INSERT INTO webcam_sources ("siteId", label, "baseUrl")
VALUES ('three-sisters-flowerdale', 'Flowerdale', 'https://au2.airportweathercams.com/Flowerdale/')
ON CONFLICT ("siteId") DO NOTHING;
