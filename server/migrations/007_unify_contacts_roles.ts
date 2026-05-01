import type Database from "better-sqlite3";

export const description = "Unify contacts with roles, migrate admin_users and safety_officers";

export function run(db: Database.Database) {
  
  const contactCols = [
    "surname TEXT DEFAULT ''",
    "isAdmin INTEGER DEFAULT 0",
    "isCommittee INTEGER DEFAULT 0",
    "isContractor INTEGER DEFAULT 0",
    "isParksVic INTEGER DEFAULT 0",
    "isSO INTEGER DEFAULT 0",
    "isSSO INTEGER DEFAULT 0",
    "password TEXT DEFAULT ''",
  ];
  for (const col of contactCols) {
    try { db.exec(`ALTER TABLE contacts ADD COLUMN ${col}`); } catch {}
  }

  const existingOfficers = db.prepare("SELECT * FROM safety_officers").all() as any[];
  for (const officer of existingOfficers) {
    const existing = db.prepare("SELECT id FROM contacts WHERE email = ? AND email != ''").get(officer.email);
    if (existing) {
      const flag = officer.type === "SSO" ? "isSSO" : "isSO";
      db.prepare(`UPDATE contacts SET ${flag} = 1 WHERE id = ?`).run((existing as any).id);
    } else {
      const id = `con-${Math.random().toString(36).substr(2, 9)}`;
      const isSO = officer.type === "SO" ? 1 : 0;
      const isSSO = officer.type === "SSO" ? 1 : 0;
      db.prepare(
        "INSERT INTO contacts (id, name, phone, email, isSO, isSSO) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, officer.name, officer.phone || "", officer.email || "", isSO, isSSO);
    }
  }

  const existingAdmins = db.prepare("SELECT * FROM admin_users").all() as any[];
  for (const admin of existingAdmins) {
    const existing = db.prepare("SELECT id FROM contacts WHERE email = ? AND email != ''").get(admin.email);
    if (existing) {
      db.prepare("UPDATE contacts SET isAdmin = 1, password = ? WHERE id = ?").run(admin.password, (existing as any).id);
    } else {
      const id = `con-${Math.random().toString(36).substr(2, 9)}`;
      db.prepare(
        "INSERT INTO contacts (id, name, email, password, isAdmin) VALUES (?, ?, ?, ?, 1)"
      ).run(id, admin.name, admin.email, admin.password);
    }
  }

  db.prepare("DELETE FROM admin_sessions").run();

  console.log("[INFO] [migration-v7]",`Migrated ${existingOfficers.length} safety officers and ${existingAdmins.length} admin users into contacts`);
}
