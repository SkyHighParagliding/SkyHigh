import type Database from "better-sqlite3";

export const description = "Add soAuthorised flag to contacts and temporarilyClosed column to sites";

export function run(db: Database.Database) {
  try { db.exec("ALTER TABLE contacts ADD COLUMN soAuthorised INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE sites ADD COLUMN temporarilyClosed INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE sites ADD COLUMN preClosureOverrideHideClosed TEXT"); } catch {}
  try { db.exec("ALTER TABLE admin_sessions ADD COLUMN soSiteId TEXT"); } catch {}
}
