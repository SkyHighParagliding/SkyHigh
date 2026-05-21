CREATE TABLE IF NOT EXISTS site_closure_dates (
  id SERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  closure_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (site_id, closure_date)
);

CREATE INDEX IF NOT EXISTS idx_site_closure_dates_site_id ON site_closure_dates(site_id);
CREATE INDEX IF NOT EXISTS idx_site_closure_dates_date ON site_closure_dates(closure_date);
