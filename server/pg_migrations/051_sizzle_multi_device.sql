-- Sausage sizzle till, several devices at once (TASK-040, DECISION-020).
--
-- Every row gets a change number from one shared sequence, bumped again when a
-- sale is voided, so a device can ask "what changed since N?" without trusting
-- anyone's clock. Devices re-ask with an overlap, so a slow transaction that
-- commits a lower number late is still picked up.
CREATE SEQUENCE IF NOT EXISTS sizzle_change_seq;

ALTER TABLE sizzle_sales ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT nextval('sizzle_change_seq');
ALTER TABLE sizzle_snapshots ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT nextval('sizzle_change_seq');

CREATE INDEX IF NOT EXISTS idx_sizzle_sales_seq ON sizzle_sales (event, seq);
CREATE INDEX IF NOT EXISTS idx_sizzle_snapshots_seq ON sizzle_snapshots (event, seq);

-- Phones that may use the till without an admin login. An admin creates a row
-- with a one-time pairing code (shown as a QR on the iPad, valid 10 minutes);
-- the phone swaps the code for a till-only token. Only SHA-256 hashes are kept.
-- A token works for one event, can only sync sales and read prices/stock, and
-- stops at "expiresAt" or when an admin revokes it.
CREATE TABLE IF NOT EXISTS sizzle_devices (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  name TEXT NOT NULL,
  "pairCodeHash" TEXT,
  "pairExpiresAt" TIMESTAMPTZ,
  "tokenHash" TEXT UNIQUE,
  "pairedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "lastSeenAt" TIMESTAMPTZ,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sizzle_devices_event ON sizzle_devices (event);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sizzle_devices_pair ON sizzle_devices ("pairCodeHash");
