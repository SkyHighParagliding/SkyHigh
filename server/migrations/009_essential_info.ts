import type Database from "better-sqlite3";

export const description = "Add essential info columns to sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN essentialInfoImages TEXT DEFAULT '[]'"); } catch {}
  try { db.exec("ALTER TABLE sites ADD COLUMN essentialInfoText TEXT DEFAULT ''"); } catch {}
}
