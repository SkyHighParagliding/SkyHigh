import type Database from "better-sqlite3";

export const description = "Add siteguideVersion and siteguideScrapedAt columns to sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN siteguideVersion TEXT"); } catch {}
  try { db.exec("ALTER TABLE sites ADD COLUMN siteguideScrapedAt TEXT"); } catch {}
}
