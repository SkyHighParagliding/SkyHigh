import type Database from "better-sqlite3";

export const description = "Remove redundant wind/rating columns (rating, windSpeedMinIdeal, windSpeedMaxIdeal, windDirectionsIdeal)";

export function run(db: Database.Database) {
    try { db.exec("ALTER TABLE sites DROP COLUMN rating"); } catch {}
  try { db.exec("ALTER TABLE sites DROP COLUMN windSpeedMinIdeal"); } catch {}
  try { db.exec("ALTER TABLE sites DROP COLUMN windSpeedMaxIdeal"); } catch {}
  try { db.exec("ALTER TABLE sites DROP COLUMN windDirectionsIdeal"); } catch {}
  console.log("[INFO] [migration-v24]","Dropped redundant columns: rating, windSpeedMinIdeal, windSpeedMaxIdeal, windDirectionsIdeal");
}
