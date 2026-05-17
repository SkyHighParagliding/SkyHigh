#!/usr/bin/env node
import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "server", "pg_migrations");

async function getMigrationsDir() {
  if (fs.existsSync(migrationsDir)) return migrationsDir;
  const cwdDir = path.join(process.cwd(), "server", "pg_migrations");
  if (fs.existsSync(cwdDir)) return cwdDir;
  return migrationsDir;
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log("🔄 Starting PostgreSQL migrations...");

    // Create schema_migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ schema_migrations table ready");

    // Get applied versions
    const result = await client.query("SELECT version FROM schema_migrations");
    const applied = new Set(result.rows.map((r) => r.version));

    const dir = await getMigrationsDir();
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d{3})_/);
      if (!match) continue;
      const version = parseInt(match[1], 10);

      if (applied.has(version)) {
        console.log(`⏭️  Migration v${version} already applied`);
        continue;
      }

      const description = file
        .replace(/^\d{3}_/, "")
        .replace(/\.sql$/, "")
        .replace(/_/g, " ");

      const filePath = path.join(dir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      try {
        console.log(`🚀 Running migration v${version}: ${description}`);
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version, description) VALUES ($1, $2)", [version, description]);
        console.log(`✅ Migration v${version} completed`);
      } catch (err) {
        console.error(`❌ Migration v${version} failed: ${err.message}`);
        throw err;
      }
    }

    console.log("✨ All migrations completed successfully!");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
