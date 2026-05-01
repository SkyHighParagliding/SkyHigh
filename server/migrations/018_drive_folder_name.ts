import type Database from "better-sqlite3";

export const description = "Add driveFolderName to projects for Apps Script subfolder tracking";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE projects ADD COLUMN driveFolderName TEXT"); } catch {}
}
