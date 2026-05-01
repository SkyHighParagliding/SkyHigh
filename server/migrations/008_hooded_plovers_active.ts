import type Database from "better-sqlite3";

export const description = "Add hoodedPloversActive column to sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN hoodedPloversActive TEXT DEFAULT 'false'"); } catch {}
}
