-- Migration 026: Fix retrievals.claimedAt column type
--
-- The original migration 024 declared claimedAt as TIMESTAMPTZ, but all runtime
-- code writes Date.now() (a JS millisecond integer) into this column. PostgreSQL
-- cannot coerce a bare number to TIMESTAMPTZ.
--
-- Fix: Change the column type to BIGINT to match the actual usage pattern.
-- Other timestamp columns in the retrievals table (pilotUpdatedAt, driverUpdatedAt)
-- are also INTEGER/BIGINT for the same reason.
--
-- This is wrapped in a DO block so that the SQLite migration runner strips it
-- (SQLite doesn't support ALTER COLUMN TYPE, and its column is already INTEGER).

DO $$
BEGIN
  -- Use EXTRACT(EPOCH) to safely convert any existing TIMESTAMPTZ data (if any)
  -- to epoch milliseconds. NULL values stay NULL.
  ALTER TABLE retrievals ALTER COLUMN "claimedAt" TYPE BIGINT
    USING (EXTRACT(EPOCH FROM "claimedAt") * 1000)::bigint;
END $$;
