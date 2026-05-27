-- Migration 025: Add columns that exist in PostgreSQL but are missing from SQLite dev databases.
-- These columns are referenced by active CRUD code and crash SQLite on INSERT/UPDATE.
-- PostgreSQL: IF NOT EXISTS makes this a safe no-op.
-- SQLite: convertSchemaToSqlite() strips IF NOT EXISTS; the migration runner catches "duplicate column"
--          errors via try/catch, so re-runs are safe.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS "closurePillsMax" INTEGER DEFAULT 7;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "launchHeight2" TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "landingHeight2" TEXT;
ALTER TABLE image_submissions ADD COLUMN IF NOT EXISTS "photographerCredit" TEXT;
