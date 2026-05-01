import type Database from "better-sqlite3";

export const description = "Add heroImage column to pages and news for banner images";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE pages ADD COLUMN heroImage TEXT"); } catch {}
  try { db.exec("ALTER TABLE news ADD COLUMN heroImage TEXT"); } catch {}
}
