-- Sausage sizzle events set up from the till (TASK-039). The product list and
-- prices still come from data/sizzle/sizzle-2026.json; an event row supplies
-- the name, trading days and customer estimates, and its id tags every sale and
-- record. With no rows the till uses the event in the JSON file (2026-ntvo).
-- Exactly one event is active at a time; old events and their records stay.
CREATE TABLE IF NOT EXISTS sizzle_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  days JSONB NOT NULL,
  "customersPerDay" JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sizzle_events_one_active ON sizzle_events (active) WHERE active;
