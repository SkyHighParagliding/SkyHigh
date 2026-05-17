-- Fix extended_wind_grids column names to be quoted camelCase
-- Previous migration created unquoted columns which became lowercase in PostgreSQL
-- This migration renames them to properly quoted camelCase identifiers

BEGIN;

-- Check if the table exists and has the old column names
DO $$
BEGIN
  -- Rename computedat to "computedAt"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extended_wind_grids' AND column_name = 'computedat'
  ) THEN
    ALTER TABLE extended_wind_grids RENAME COLUMN computedat TO "computedAt";
  END IF;

  -- Rename winddata to "windData"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extended_wind_grids' AND column_name = 'winddata'
  ) THEN
    ALTER TABLE extended_wind_grids RENAME COLUMN winddata TO "windData";
  END IF;
END $$;

COMMIT;
