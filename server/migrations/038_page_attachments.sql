CREATE TABLE IF NOT EXISTS page_attachments (
  id TEXT PRIMARY KEY,
  pageSlug TEXT NOT NULL,
  filename TEXT NOT NULL,
  originalFilename TEXT NOT NULL,
  fileSize INTEGER NOT NULL,
  mimeType TEXT NOT NULL,
  downloadCount INTEGER DEFAULT 0,
  uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_attachments_slug ON page_attachments(pageSlug);
