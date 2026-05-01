import type Database from "better-sqlite3";

export const description = "Add firstName/lastName to pilots, accountType to password_reset_tokens";

export const sql = `
ALTER TABLE pilots ADD COLUMN firstName TEXT NOT NULL DEFAULT '';
ALTER TABLE pilots ADD COLUMN lastName TEXT NOT NULL DEFAULT '';
ALTER TABLE password_reset_tokens ADD COLUMN accountType TEXT NOT NULL DEFAULT 'contact';
`;

export function run(db: Database.Database) {
    const pilots = db.prepare("SELECT id, name FROM pilots").all() as { id: string; name: string }[];
  for (const p of pilots) {
    const parts = (p.name || "").trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
    db.prepare("UPDATE pilots SET firstName = ?, lastName = ? WHERE id = ?").run(firstName, lastName, p.id);
  }
  console.log("[INFO] [migration-v43]",`Migrated ${pilots.length} pilot name(s) to firstName/lastName`);
}
