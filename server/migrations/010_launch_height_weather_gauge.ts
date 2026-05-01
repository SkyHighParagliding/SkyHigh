import type Database from "better-sqlite3";

export const description = "Add launchHeightHigh and weatherGaugeUrl columns to sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN launchHeightHigh TEXT"); } catch {}
  try { db.exec("ALTER TABLE sites ADD COLUMN weatherGaugeUrl TEXT"); } catch {}
}
