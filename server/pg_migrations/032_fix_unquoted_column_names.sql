-- Migration 032: Fix lowercase column names from migrations 030 and 031
--
-- Background: migrations 030 (fullNameDisplay) and 031 (photoUrl, photoAuthorised)
-- used UNQUOTED identifiers in PostgreSQL. PostgreSQL folds unquoted identifiers
-- to lowercase, so the columns were created as:
--   - fullnamedisplay  (not "fullNameDisplay")
--   - photourl         (not "photoUrl")
--   - photoauthorised  (not "photoAuthorised")
--
-- The application's pgDb adapter wraps camelCase identifiers in double quotes,
-- so SELECT/UPDATE queries look for "photoUrl" etc., which fail with
-- "column does not exist" errors against the lowercase columns.
--
-- Fix: drop the lowercase columns and recreate them with quoted (case-preserving)
-- names. No production data is lost because the lowercase columns were never
-- successfully written to by the application (the UPDATE queries also failed).

ALTER TABLE contacts DROP COLUMN IF EXISTS photourl;
ALTER TABLE contacts DROP COLUMN IF EXISTS photoauthorised;
ALTER TABLE contacts DROP COLUMN IF EXISTS fullnamedisplay;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "photoUrl" VARCHAR(255) DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "photoAuthorised" INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "fullNameDisplay" INTEGER DEFAULT 1;
