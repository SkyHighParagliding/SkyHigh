CREATE TABLE IF NOT EXISTS document_index (
  driveFileId TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  mimeType TEXT,
  driveUrl TEXT,
  textContent TEXT,
  charCount INTEGER DEFAULT 0,
  readable INTEGER DEFAULT 0,
  indexedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastModified TEXT
);
