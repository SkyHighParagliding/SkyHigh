import type Database from "better-sqlite3";

export const description = "Add contentHash column to sites for change detection during scraping";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN contentHash TEXT"); } catch {}
}
