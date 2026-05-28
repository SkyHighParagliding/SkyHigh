import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import createLogger from "./utils/logger.js";

const log = createLogger("database");

// Quote-aware SQL splitter — splits on semicolons outside of:
//   - single-quoted strings ('...' with '' escape)
//   - dollar-quoted strings ($$...$$ or $tag$...$tag$)
//   - line comments (-- ... \n)
// Used by the PG migration runner.
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let dollarTag: string | null = null;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Inside a dollar-quoted block — look for the closing tag
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        current += ch;
        i++;
      }
      continue;
    }

    // Inside a single-quoted string
    if (inString) {
      if (ch === "'" && sql[i + 1] === "'") {
        current += "''";
        i += 2;
      } else if (ch === "'") {
        inString = false;
        current += ch;
        i++;
      } else {
        current += ch;
        i++;
      }
      continue;
    }

    // Line comment — skip to end of line (semicolons inside don't count)
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      if (end === -1) { i = sql.length; } else { current += sql.slice(i, end + 1); i = end + 1; }
      continue;
    }

    // Outside any string — check for start of quoted context or semicolon
    if (ch === "'") {
      inString = true;
      current += ch;
      i++;
    } else if (ch === '$') {
      const match = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
      } else {
        current += ch;
        i++;
      }
    } else if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
    } else {
      current += ch;
      i++;
    }
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

function getMigrationsDir(): string {
  // Always use pg_migrations/ — these are SQL files written in Postgres syntax.
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

// ─── PostgreSQL migration runner (runs on startup) ────────────────────────────

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

          await client.query("BEGIN");
          for (const stmt of splitSqlStatements(sql)) {
            await client.query(stmt);
          }
          await client.query(
            "INSERT INTO schema_migrations (version, description) VALUES ($1, $2)",
            [version, description]
          );
          await client.query("COMMIT");
          log.info(`PostgreSQL migration v${version} completed`);
        } catch (err: any) {
          try { await client.query("ROLLBACK"); } catch { /* ignore rollback failure */ }
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

// Run migrations as a side effect when this module is imported
await runPostgresMigrations();
