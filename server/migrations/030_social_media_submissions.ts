import type Database from "better-sqlite3";

export const description = "Add isSocialMedia flag to contacts and create image_submissions table";

export const sql = `
CREATE TABLE IF NOT EXISTS image_submissions (
  id TEXT PRIMARY KEY,
  originalFilename TEXT NOT NULL,
  storedFilename TEXT NOT NULL,
  filePath TEXT NOT NULL,
  fileSize INTEGER NOT NULL,
  mimeType TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  moderationFlag TEXT,
  moderationNote TEXT,
  submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewedAt DATETIME,
  reviewedBy TEXT
);
`;

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE contacts ADD COLUMN isSocialMedia INTEGER DEFAULT 0"); } catch {}
}
