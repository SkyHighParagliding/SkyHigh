-- Sausage sizzle till backup. The iPad till (/admin/sizzle) writes every sale
-- to IndexedDB first and syncs here when online, so a lost or reset iPad can be
-- restored. Rows are keyed by the client-generated id, so a re-sent sale is an
-- upsert, never a duplicate. A void re-sends the same id with voided = TRUE.
-- "event" (e.g. 2026-ntvo) keeps each sizzle event's records separate so they
-- can be reported on and compared with the next one.
CREATE TABLE IF NOT EXISTS sizzle_sales (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  day INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
  total NUMERIC(10, 2) NOT NULL,
  tendered NUMERIC(10, 2),
  change NUMERIC(10, 2),
  lines JSONB NOT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  "voidedAt" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sizzle_sales_day ON sizzle_sales (event, day, "createdAt");

-- Everything else the till keeps (settings, stock baselines, end-of-day
-- closes, purchases with receipt photos, banking, Stripe actuals) as JSON
-- snapshots. Latest row per (event, kind, key) wins on restore.
CREATE TABLE IF NOT EXISTS sizzle_snapshots (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sizzle_snapshots_kind ON sizzle_snapshots (event, kind, key, "createdAt");
