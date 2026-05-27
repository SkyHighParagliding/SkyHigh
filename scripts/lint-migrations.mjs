// Lint pg_migrations/*.sql for common mistakes that cause silent failures on PostgreSQL.
//
// Checks:
//   1. Unquoted camelCase column names in ADD/RENAME COLUMN statements
//      (PG folds unquoted identifiers to lowercase; "photoUrl" → "photourl" without quotes)
//   2. Duplicate migration version numbers
//      (Two files with the same NNN_ prefix cause a primary key violation in schema_migrations)

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "server/pg_migrations";
const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
const errors = [];

// ─── Check 1: unquoted camelCase identifiers ──────────────────────────────────
//
// Matches:  ADD COLUMN photoUrl ...
//           ADD COLUMN IF NOT EXISTS photoUrl ...
//           RENAME COLUMN x TO photoUrl
// Skips:    already-quoted "photoUrl"
//           all-lowercase names
//           names with no uppercase at all
const camelUnquoted = /\b(ADD|RENAME)\s+(COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\s+TO\s+)?)?([a-z][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*)\b/g;

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  // Strip comments before matching to avoid false positives in comment text
  const stripped = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  let m;
  while ((m = camelUnquoted.exec(stripped)) !== null) {
    // Skip if the identifier is immediately preceded by a double-quote
    const precedingChar = stripped[m.index + m[0].indexOf(m[3]) - 1];
    if (precedingChar === '"') continue;
    errors.push(`${f}: unquoted camelCase identifier "${m[3]}" — wrap in double quotes`);
  }
}

// ─── Check 2: duplicate version numbers ──────────────────────────────────────
const versionMap = {};
for (const f of files) {
  const match = f.match(/^(\d{3})_/);
  if (!match) continue;
  const v = parseInt(match[1], 10);
  if (versionMap[v]) {
    errors.push(`Duplicate migration version ${v}: "${versionMap[v]}" and "${f}"`);
  } else {
    versionMap[v] = f;
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error("Migration lint FAILED:");
  errors.forEach(e => console.error("  " + e));
  process.exit(1);
}

console.log(`Migration lint passed — ${files.length} files clean.`);
