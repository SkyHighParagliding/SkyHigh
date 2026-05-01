import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import createLogger from "./utils/logger.js";
import db, { pool } from "./pgDb.js";

const log = createLogger("database");

async function getAppliedVersions(): Promise<Set<number>> {
  try {
    const result = await pool.query("SELECT version FROM schema_migrations");
    return new Set(result.rows.map((r: any) => r.version));
  } catch {
    return new Set();
  }
}

function getMigrationsDir(): string {
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

async function runMigrations() {
  const migrationsDir = getMigrationsDir();

  if (!fs.existsSync(migrationsDir)) {
    log.warn(`PG migrations directory not found: ${migrationsDir}`);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await getAppliedVersions();

  for (const file of files) {
    const version = parseMigrationVersion(file);
    if (version === null) continue;
    if (applied.has(version)) continue;

    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, "utf-8");
    const description = file
      .replace(/^\d{3}_/, "")
      .replace(/\.sql$/, "")
      .replace(/_/g, " ");

    log.info(`Running PG migration v${version}: ${description}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (sqlContent.trim()) {
        await client.query(sqlContent);
      }
      await client.query(
        "INSERT INTO schema_migrations (version, description) VALUES ($1, $2)",
        [version, description]
      );
      await client.query("COMMIT");
      applied.add(version);
      log.info(`PG migration v${version} completed`);
    } catch (err: any) {
      await client.query("ROLLBACK");
      log.error(`PG migration v${version} failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }
}

await runMigrations();

export default db;
