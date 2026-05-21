-- Rename closurepillsmax → "closurePillsMax" if migration 021 created it without quotes.
-- In SQLite this is a no-op (column was already created with correct case).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'closurepillsmax'
  ) THEN
    ALTER TABLE sites RENAME COLUMN closurepillsmax TO "closurePillsMax";
  END IF;
END $$;
