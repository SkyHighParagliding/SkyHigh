-- Migration 033: Ensure safetyOfficerType column exists with correct case
--
-- The /public/committee endpoint errors with:
--   column "safetyOfficerType" does not exist
--
-- Possible causes:
-- 1. Two migration files share version 17 (017_add_safetyOfficerType.sql and
--    017_revert_image_library_to_working_bucket.sql). The runner records ONE
--    row per version, so only the alphabetically-first file ran. If the
--    "revert" file ran first historically, the safetyOfficerType file was
--    skipped forever.
-- 2. Earlier broken migration runner only executed the first statement of
--    multi-statement files. 017_add_safetyOfficerType has 2 statements, so
--    one or both may have failed/skipped.
--
-- Fix: idempotent recreation. Drops a lowercase variant if it exists, then
-- adds the camelCase column if missing. Safe to run multiple times.

ALTER TABLE contacts DROP COLUMN IF EXISTS safetyofficertype;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "safetyOfficerType" TEXT DEFAULT NULL;
