import type Database from "better-sqlite3";

export const description = "Add policy and costs fields to projects";

export function run(db: Database.Database) {
  const policyCols = [
    "estimatedBudget TEXT DEFAULT ''",
    "fundingSource TEXT DEFAULT ''",
    "insuranceRequirements TEXT DEFAULT ''",
    "supplierQuotes TEXT DEFAULT ''",
    "complianceNotes TEXT DEFAULT ''",
    "approvedBy TEXT DEFAULT ''",
    "approvalDate TEXT DEFAULT ''",
  ];
  for (const col of policyCols) {
    try { db.exec(`ALTER TABLE projects ADD COLUMN ${col}`); } catch {}
  }
}
