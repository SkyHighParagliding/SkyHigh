CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  usedAt TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);
