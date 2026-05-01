import type Database from "better-sqlite3";

export const description = "Add liveStationIdAlt column to sites for alternate weather station";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE sites ADD COLUMN liveStationIdAlt TEXT"); } catch {}
}
