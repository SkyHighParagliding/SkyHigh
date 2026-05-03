import type Database from "better-sqlite3";

export const description = "Seed cache timer settings for configurable cache durations";

export function run(db: Database.Database) {
  const stmt = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");

  stmt.run("cacheAdminSessionTtl", "24");
  stmt.run("cacheTidyHqMemberTtl", "15");
  stmt.run("cacheBomTideTtl", "6");
  stmt.run("cacheAstroTideTtl", "30");
  stmt.run("cacheTidyHqEventsTtl", "5");
  stmt.run("cacheSearchContextTtl", "5");
  stmt.run("cacheAssetRegisterTtl", "10");
  stmt.run("cacheFreeFlightWxTtl", "30");
}
