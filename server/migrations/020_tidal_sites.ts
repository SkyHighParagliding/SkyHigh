import type Database from "better-sqlite3";

export const description = "Add tidal site support — isTidal flag and tideStationId on sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN isTidal TEXT DEFAULT 'false'"); } catch {}
  try { db.exec("ALTER TABLE sites ADD COLUMN tideStationId TEXT"); } catch {}
}
