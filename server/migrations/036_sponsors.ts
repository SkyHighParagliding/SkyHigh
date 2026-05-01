import type Database from "better-sqlite3";

export const description = "Create sponsors table and migrate from homeSponsors setting";

export const sql = `
CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT DEFAULT '',
  url TEXT DEFAULT '',
  markdown TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export function run(db: Database.Database) {
    try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'homeSponsors'").get() as { value: string } | undefined;
    if (row && row.value) {
      const sponsors = JSON.parse(row.value);
      if (Array.isArray(sponsors) && sponsors.length > 0) {
        const insert = db.prepare(
          "INSERT OR IGNORE INTO sponsors (id, name, logo, url, markdown, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
        );
        sponsors.forEach((s: any, i: number) => {
          const id = `spo-${Math.random().toString(36).substr(2, 9)}`;
          insert.run(id, s.name || "", s.logo || "", s.url || "", s.markdown || "", i);
        });
        console.log("[INFO] [migration-v36]",`Migrated ${sponsors.length} sponsors from homeSponsors setting`);
      }
    }
  } catch (e: any) {
    console.warn("[WARN] [migration-v36]",`Could not migrate homeSponsors: ${e.message}`);
  }
}
