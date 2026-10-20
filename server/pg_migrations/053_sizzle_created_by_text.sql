-- Admin user ids are text (e.g. "con-utioy5vpd"), so "createdBy" on the sizzle
-- devices and events tables must be TEXT, not INTEGER. Adding a phone failed
-- with "invalid input syntax for type integer".
ALTER TABLE sizzle_devices ALTER COLUMN "createdBy" TYPE TEXT USING "createdBy"::text;
ALTER TABLE sizzle_events ALTER COLUMN "createdBy" TYPE TEXT USING "createdBy"::text;
