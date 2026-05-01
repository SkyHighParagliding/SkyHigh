import type Database from "better-sqlite3";

export const description = "Replace isSO/isSSO with isSafetyCommittee";

export const sql = `ALTER TABLE contacts ADD COLUMN isSafetyCommittee INTEGER DEFAULT 0;`;

export function run(db: Database.Database) {
    try {
    db.exec("UPDATE contacts SET isSafetyCommittee = 1 WHERE isSO = 1 OR isSSO = 1");
    console.log("[INFO] [migration-v27]","Copied isSO/isSSO flags to isSafetyCommittee");
  } catch {}
}
