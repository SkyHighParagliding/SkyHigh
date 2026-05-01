import type Database from "better-sqlite3";

export const description = "Add skipBulkImport flag to sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN skipBulkImport TEXT DEFAULT 'false'"); } catch {}
  try { db.exec("UPDATE sites SET skipBulkImport = 'true' WHERE id = 'phillip-island'"); } catch {}
}
