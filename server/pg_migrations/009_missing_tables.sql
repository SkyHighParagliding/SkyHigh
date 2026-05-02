-- Migration 009: Tables added after the initial pg schema (migrations 022-051 in SQLite)
-- All idempotent via IF NOT EXISTS / IF NOT EXISTS index guards

-- Hero images on sites (SQLite migration 022)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "heroImages" TEXT DEFAULT '[]';

-- Site archives (SQLite migration 023)
-- Already in 001, but adding the unique index guard
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_archives_version ON site_archives("siteguideVersion");

-- Skip bulk import flag (SQLite migration 025)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "skipBulkImport" TEXT DEFAULT 'false';

-- TidyHQ groups (SQLite migration 026) — already in 001_full_schema.sql

-- Safety committee flag on contacts (SQLite migration 027)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "isSafetyCommittee" INTEGER DEFAULT 0;

-- Password reset tokens (SQLite migration 028) — already in 001

-- Emergency hospitals cache (SQLite migration 029) — already in 001

-- Social media submissions (SQLite migration 030)
ALTER TABLE image_submissions ADD COLUMN IF NOT EXISTS "siteId" TEXT;
ALTER TABLE image_submissions ADD COLUMN IF NOT EXISTS "caption" TEXT;
ALTER TABLE image_submissions ADD COLUMN IF NOT EXISTS "siteMapId" TEXT;

-- Submission IP tracking (SQLite migration 031) — already in 001

-- Display flags on sites (SQLite migration 032)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "displayOnMap" INTEGER DEFAULT 1;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "displayInList" INTEGER DEFAULT 1;

-- Contact position (SQLite migration 033) — already in 001_full_schema

-- Contact show flags (SQLite migration 034) — already in 001_full_schema

-- Show admin email flag (SQLite migration 035) — already in 001_full_schema

-- Sponsors table (SQLite migration 036) — already in 001_full_schema

-- Business directory & ground handling (SQLite migration 037) — already in 001_full_schema

-- Page attachments (SQLite migration 038) — already in 001_full_schema

-- Competitions (SQLite migration 039) — already in 001_full_schema

-- Pilots (SQLite migration 040) — already in 001_full_schema

-- Flights (SQLite migration 041) — already in 001_full_schema

-- Breadcrumbs (SQLite migration 042) — already in 001_full_schema

-- Pilot names fields (SQLite migration 043)
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS "lastName" TEXT NOT NULL DEFAULT '';

-- Performance indexes (SQLite migration 044) — already in 001_full_schema

-- Retrievals (SQLite migration 045) — already in 001_full_schema

-- Retrieval ETA (SQLite migration 046)
ALTER TABLE retrievals ADD COLUMN IF NOT EXISTS "etaMinutes" INTEGER;

-- Retrieval driver index (SQLite migration 047) — already in 001_full_schema

-- Garmin mapshare on pilots (SQLite migration 048)
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS "garminMapshare" TEXT DEFAULT NULL;

-- SPOT / Zoleo on pilots (SQLite migration 049)
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS "spotFeedId" TEXT DEFAULT NULL;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS "zoleoImei" TEXT DEFAULT NULL;

-- Map messages (SQLite migration 050) — already in 001_full_schema

-- Safety sections (SQLite migration 051) — already in 001_full_schema

-- Pilot sessions (SQLite migration 008 in pg_migrations)
CREATE TABLE IF NOT EXISTS pilot_sessions (
  token TEXT PRIMARY KEY,
  "pilotId" TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pilot_sessions_pilotid ON pilot_sessions ("pilotId");

-- isXCSite flag (SQLite migration — added later)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "isXCSite" TEXT DEFAULT 'false';
