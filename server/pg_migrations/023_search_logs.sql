CREATE TABLE IF NOT EXISTS search_logs (
  id SERIAL PRIMARY KEY,
  search_type TEXT NOT NULL DEFAULT 'public',
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_type ON search_logs(search_type);

INSERT INTO settings (key, value) VALUES ('searchLoggingEnabled', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('searchLogSizeWarningMb', '10') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('searchLogWarningSent', 'false') ON CONFLICT (key) DO NOTHING;
