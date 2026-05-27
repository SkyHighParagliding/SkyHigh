-- Migration 037: Change admin_sessions.userId from INTEGER to TEXT
--
-- contacts.id is TEXT ("con-abc123" format) but admin_sessions.userId was
-- declared INTEGER in the original schema. SQLite's dynamic typing silently
-- allowed this; PostgreSQL rejects the JOIN with "operator does not exist:
-- integer = text".
--
-- USING clause: cast any existing integer values to text before changing type.
-- Existing sessions won't match any contact (int-like strings ≠ "con-xxx" IDs)
-- so they'll expire/be rejected harmlessly.

ALTER TABLE admin_sessions ALTER COLUMN "userId" TYPE TEXT USING "userId"::TEXT;
