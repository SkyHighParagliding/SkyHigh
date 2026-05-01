import type Database from "better-sqlite3";

export const description = "Add submitterIp to image_submissions and create banned_ips table";

export const sql = `
CREATE TABLE IF NOT EXISTS banned_ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT,
  bannedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  bannedBy TEXT
);
`;

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE image_submissions ADD COLUMN submitterIp TEXT"); } catch {}
}
