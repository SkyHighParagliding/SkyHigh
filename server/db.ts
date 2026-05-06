import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import createLogger from "./utils/logger.js";

const log = createLogger("database");

// ─── Adapter selection ────────────────────────────────────────────────────────
// Set DATABASE_URL in .env to use PostgreSQL.
// Leave it unset to use the local SQLite file (database/db.sqlite).

const usePostgres = !!process.env.DATABASE_URL;

let db: any;

if (usePostgres) {
  log.info("DATABASE_URL detected — loading PostgreSQL adapter");
  const { default: pgDb } = await import("./pgDb.js");
  db = pgDb;
} else {
  log.info("No DATABASE_URL — loading SQLite adapter");
  const { default: sqliteDb } = await import("./sqliteDb.js");
  db = sqliteDb;
  await runSQLiteMigrations(db);
}

// ─── SQLite migration runner (only used when not in Postgres mode) ─────────────

function getAppliedVersions(database: any): Set<number> {
  try {
    const rows = database.prepare("SELECT version FROM schema_migrations").all();
    return new Set(rows.map((r: any) => r.version));
  } catch {
    return new Set();
  }
}

function getMigrationsDir(): string {
  // Always use pg_migrations/ — these are SQL files written in Postgres syntax
  // that get converted to SQLite on-the-fly. The migrations/ folder uses a
  // different format (raw better-sqlite3) and is NOT used by this runner.
  const currentFile = fileURLToPath(import.meta.url);
  const relativeDir = path.join(path.dirname(currentFile), "pg_migrations");
  if (fs.existsSync(relativeDir)) return relativeDir;
  const cwdDir = path.join(process.cwd(), "server", "pg_migrations");
  if (fs.existsSync(cwdDir)) return cwdDir;
  return relativeDir;
}

function parseMigrationVersion(filename: string): number | null {
  const match = filename.match(/^(\d{3})_/);
  return match ? parseInt(match[1], 10) : null;
}

// Convert PostgreSQL schema syntax to SQLite when running .sql migration files
function convertSchemaToSqlite(sql: string): string {
  let result = sql;
  result = result.replace(/SERIAL PRIMARY KEY/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");
  result = result.replace(/TIMESTAMPTZ/gi, "TEXT");
  result = result.replace(/NOW\(\)::TEXT/gi, "CURRENT_TIMESTAMP");
  // SQLite doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN, so wrap in error handling
  result = result.replace(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+IF NOT EXISTS/gi, "ALTER TABLE $1 ADD COLUMN");
  return result;
}

async function runSQLiteMigrations(database: any) {
  const migrationsDir = getMigrationsDir();

  if (!fs.existsSync(migrationsDir)) {
    log.warn(`Migrations directory not found: ${migrationsDir}`);
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Create schema_migrations table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = getAppliedVersions(database);

  for (const file of files) {
    const version = parseMigrationVersion(file);
    if (version === null) continue;
    if (applied.has(version)) continue;

    const filePath = path.join(migrationsDir, file);
    const description = file
      .replace(/^\d{3}_/, "")
      .replace(/\.(sql|ts|js)$/, "")
      .replace(/_/g, " ");

    log.info(`Running SQLite migration v${version}: ${description}`);

    try {
      const sqlContent = fs.readFileSync(filePath, "utf-8");
      const sqliteContent = convertSchemaToSqlite(sqlContent);
      database.exec("BEGIN");
      if (sqliteContent.trim()) {
        // Split into individual statements and execute with error tolerance for idempotent operations
        const statements = sqliteContent.split(';').filter(s => s.trim());
        for (const stmt of statements) {
          try {
            if (stmt.trim()) {
              database.exec(stmt.trim() + ';');
            }
          } catch (stmtErr: any) {
            // Log but don't fail on column-already-exists or similar idempotent errors
            if (stmtErr.message?.includes('already exists') || stmtErr.message?.includes('duplicate')) {
              log.debug(`Skipping idempotent statement (already applied): ${stmt.substring(0, 50)}...`);
            } else {
              throw stmtErr;
            }
          }
        }
      }
      database.prepare("INSERT INTO schema_migrations (version, description) VALUES (?, ?)").run(version, description);
      database.exec("COMMIT");
      applied.add(version);
      log.info(`SQLite migration v${version} completed`);
    } catch (err: any) {
      try { database.exec("ROLLBACK"); } catch {}
      log.error(`SQLite migration v${version} failed: ${err.message}`);
      throw err;
    }
  }
}

export default db;
