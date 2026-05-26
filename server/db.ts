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
  // Run PostgreSQL migrations on startup
  await runPostgresMigrations();
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
  // Handle PostgreSQL CURRENT_TIMESTAMP default values for SQLite compatibility
  result = result.replace(/DEFAULT\s+CURRENT_TIMESTAMP/gi, "DEFAULT CURRENT_TIMESTAMP");
  // SQLite doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN, so wrap in error handling
  result = result.replace(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+IF NOT EXISTS/gi, "ALTER TABLE $1 ADD COLUMN");
  // Strip PostgreSQL-only DO $$ ... $$ anonymous blocks — SQLite has no equivalent
  result = result.replace(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi, "");
  
  // Convert PG ::type casts to CAST(value AS type) for SQLite compatibility
  result = result.replace(/::jsonb/gi, "");  // SQLite stores JSON as TEXT, no cast needed
  result = result.replace(/::json/gi, "");
  result = result.replace(/::text/gi, "");
  result = result.replace(/::integer/gi, "");
  
  // SQLite stores JSON as TEXT, so jsonb_array_elements → json_each (which returns same data)
  result = result.replace(/jsonb_array_elements/gi, "json_each");
  
  // Convert PG JSONB ->> operator to SQLite json_extract.
  // In json_each context (after jsonb_array_elements → json_each):
  //   elem ->> 'key'       → json_extract(elem, '$.key')
  //   fn(col) ->> 'key'    → json_extract(fn(col), '$.key') — handles json_each(lib) ->> 'banner'
  // Uses [^\S\n] (horizontal whitespace only) to avoid matching across newlines.
  // Note: json_each() is a table-valued function; json_extract(json_each(...), ...) won't
  // execute correctly at runtime, but at least the syntax is valid SQLite and won't crash
  // the migration parser. The migration 014 CTEs may still fail gracefully.
  result = result.replace(/([\w.]+(?:[^\S\n]*\([^)\n]*\))?)[^\S\n]*->>[^\S\n]*'([^']+)'/g, "json_extract($1, '$.$2')");
  
  // Convert PG regex match ~ 'pattern' to SQLite LIKE conditions.
  // For alternation patterns (a|b|c), expands to multiple LIKE … OR conditions so the
  // semantics are preserved (simple LIKE with literal pipes would match nothing).
  // Simple:  column ~ 'foo'      → column LIKE '%foo%'
  // Pipes:   column ~ 'a|b|c'    → (column LIKE '%a%' OR column LIKE '%b%' OR column LIKE '%c%')
  // The column regex handles simple names, function-call chains, and nested calls
  // like lower(coalesce(type, '')) up to 2 levels deep.
  result = result.replace(
    /(\w[\w.]*(?:\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*)*)\s*~\s*'([^']+)'/gi,
    (_match: string, column: string, pattern: string) => {
      const alts = pattern.split('|');
      if (alts.length > 1) {
        return `(${alts.map(a => `${column} LIKE '%${a}%'`).join(' OR ')})`;
      }
      return `${column} LIKE '%${pattern}%'`;
    }
  );
  
  // Convert PostgreSQL ON CONFLICT … DO NOTHING → SQLite INSERT OR IGNORE.
  // Affects migrations 006, 007, 023 — without this, SQLite logs "near ON: syntax error"
  // and the migration body is skipped (caught by try/catch but seed data is lost).
  // Uses [\s\S]+? (non-greedy) instead of [^;]+ to handle semicolons inside string
  // literals (e.g. "Weather Management; emails failing" in the website-management INSERT).
  result = result.replace(
    /(\bINSERT\s+INTO\s+[\s\S]+?)\s+ON\s+CONFLICT\s*\([^)]+\)\s+DO\s+NOTHING/gi,
    (_match: string, insertPart: string) => {
      return insertPart.replace(/\bINSERT\s+INTO\b/i, "INSERT OR IGNORE INTO");
    }
  );
  
  // Convert PG ARRAY(SELECT …)[1] to just the inner SELECT with LIMIT 1.
  // Migration 014 uses (ARRAY(SELECT … LIMIT 1))[1] to pick one random row;
  // SQLite can just use the subquery directly: (SELECT … LIMIT 1).
  // Handles both (ARRAY(SELECT …))[1] (outer-paren + ARRAY) and bare ARRAY(SELECT …)[1].
  result = result.replace(
    /\(\s*ARRAY\s*\(\s*(SELECT\s+[^;]+?)\s*\)\s*\)\s*\[1\]/gi,
    "($1)"
  );
  result = result.replace(
    /ARRAY\s*\(\s*(SELECT\s+[^;]+?)\s*\)\s*\[1\]/gi,
    (_match: string, selectStmt: string) => {
      const trimmed = selectStmt.trim();
      if (!/LIMIT\s+\d+/i.test(trimmed)) {
        return `(${trimmed} LIMIT 1)`;
      }
      return `(${trimmed})`;
    }
  );
  
  return result;
}

// ─── PostgreSQL migration runner (runs on startup in production) ─────────────

async function runPostgresMigrations() {
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    try {
      log.info("Running PostgreSQL migrations...");

      // Create schema_migrations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Get applied versions
      const result = await client.query("SELECT version FROM schema_migrations");
      const applied = new Set(result.rows.map((r: any) => r.version));

      const migrationsDir = getMigrationsDir();
      if (!fs.existsSync(migrationsDir)) {
        log.warn(`Migrations directory not found: ${migrationsDir}`);
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const version = parseMigrationVersion(file);
        if (version === null) continue;
        if (applied.has(version)) continue;

        const description = file
          .replace(/^\d{3}_/, "")
          .replace(/\.sql$/, "")
          .replace(/_/g, " ");

        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf-8");

        try {
          log.info(`Running PostgreSQL migration v${version}: ${description}`);

          // Split SQL by semicolons and execute each statement separately
          const statements = sql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

          for (const stmt of statements) {
            await client.query(stmt);
          }

          await client.query(
            "INSERT INTO schema_migrations (version, description) VALUES ($1, $2)",
            [version, description]
          );
          log.info(`PostgreSQL migration v${version} completed`);
        } catch (err: any) {
          log.error(`PostgreSQL migration v${version} failed: ${err.message}`);
          throw err;
        }
      }

      log.info("All PostgreSQL migrations completed successfully");
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err: any) {
    log.error("Failed to run PostgreSQL migrations:", err.message);
    throw err;
  }
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
      const sqliteContent = convertSchemaToSqlite(sqlContent)
        // Strip SQL comments to prevent semicolons inside comment text from breaking the splitter
        .replace(/--.*$/gm, '')
        // Strip PL/pgSQL DO $$ ... END $$ blocks (PostgreSQL-specific procedural code)
        .replace(/DO\s+\$\$[\s\S]*?END\s+\$\$;?/gi, '')
        // Strip BEGIN / COMMIT inside migration files (runner wraps in a transaction already)
        .replace(/^\s*BEGIN;?\s*$/gim, '')
        .replace(/^\s*COMMIT;?\s*$/gim, '');
      database.exec("BEGIN");
      if (sqliteContent.trim()) {
        // Split into individual statements (respecting semicolons inside string literals)
        // and execute with error tolerance for idempotent operations
        const statements: string[] = [];
        let current = '';
        let inString = false;
        for (let i = 0; i < sqliteContent.length; i++) {
          const ch = sqliteContent[i];
          const next = sqliteContent[i + 1] || '';
          if (ch === "'" && !inString) {
            inString = true;
            current += ch;
          } else if (ch === "'" && inString) {
            if (next === "'") {
              // escaped single quote '' inside string
              current += ch + next;
              i++;
            } else {
              inString = false;
              current += ch;
            }
          } else if (ch === ';' && !inString) {
            const trimmed = current.trim();
            if (trimmed) statements.push(trimmed);
            current = '';
          } else {
            current += ch;
          }
        }
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
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
      // Gracefully skip migrations that fail due to PostgreSQL-specific features
      // (JSON functions, PL/pgSQL, etc.) — these are not needed for SQLite dev
      const pgSpecificErrors = [
        'no such function: json_each',
        'no such function: jsonb',
        'no such module',
        'syntax error',
      ];
      if (pgSpecificErrors.some(e => err.message?.includes(e))) {
        log.warn(`Skipping SQLite migration v${version} (PostgreSQL-specific): ${err.message.substring(0, 80)}`);
        // Still record it as applied so it doesn't retry on next startup
        try {
          database.exec("BEGIN");
          database.prepare("INSERT INTO schema_migrations (version, description) VALUES (?, ?)").run(version, description);
          database.exec("COMMIT");
          applied.add(version);
        } catch {}
        continue;
      }
      log.error(`SQLite migration v${version} failed: ${err.message}`);
      throw err;
    }
  }
}

export default db;
