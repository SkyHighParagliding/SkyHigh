import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import createLogger from './logger.js';

const log = createLogger('migrations');

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const migrationsDir = path.join(_dirname, '../migrations');

export interface Migration {
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

export interface MigrationRecord {
  name: string;
  appliedAt: string;
}

/**
 * Ensure migrations table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        appliedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    log.info('Migrations table ready');
  } catch (e: any) {
    log.error(`Failed to create migrations table: ${e.message}`);
    throw e;
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<MigrationRecord[]> {
  try {
    const rows = await db.prepare(`
      SELECT name, appliedAt FROM migrations ORDER BY appliedAt ASC
    `).all() as MigrationRecord[];
    return rows;
  } catch (e: any) {
    log.error(`Failed to get applied migrations: ${e.message}`);
    return [];
  }
}

/**
 * Record a migration as applied
 */
async function recordMigration(name: string): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO migrations (name) VALUES (?)
    `).run(name);
  } catch (e: any) {
    log.error(`Failed to record migration: ${e.message}`);
    throw e;
  }
}

/**
 * Remove a migration record
 */
async function removeMigration(name: string): Promise<void> {
  try {
    await db.prepare(`
      DELETE FROM migrations WHERE name = ?
    `).run(name);
  } catch (e: any) {
    log.error(`Failed to remove migration record: ${e.message}`);
    throw e;
  }
}

/**
 * Load a migration module
 */
async function loadMigration(filename: string): Promise<Migration> {
  const filepath = path.join(migrationsDir, filename);
  try {
    const module = await import(`file://${filepath}`);
    return module;
  } catch (e: any) {
    log.error(`Failed to load migration ${filename}: ${e.message}`);
    throw e;
  }
}

/**
 * Get all migration files in order
 */
function getMigrationFiles(): string[] {
  try {
    const files = fs.readdirSync(migrationsDir);
    return files
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .sort(); // Migrations run in alphabetical order
  } catch (e: any) {
    log.error(`Failed to read migrations directory: ${e.message}`);
    return [];
  }
}

/**
 * Run pending migrations
 */
export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const appliedNames = new Set(applied.map(m => m.name));
  const files = getMigrationFiles();

  log.info(`Found ${files.length} migration files`);
  log.info(`Already applied: ${applied.length}`);

  let completed = 0;
  for (const file of files) {
    const migrationName = path.parse(file).name;

    if (appliedNames.has(migrationName)) {
      log.info(`⏭ Skipping already applied migration: ${migrationName}`);
      continue;
    }

    try {
      log.info(`▶ Running migration: ${migrationName}`);
      const migration = await loadMigration(file);

      if (typeof migration.up === 'function') {
        await migration.up();
        await recordMigration(migrationName);
        log.info(`✓ Migration applied: ${migrationName}`);
        completed++;
      } else {
        log.warn(`⚠ Migration ${migrationName} has no up() function`);
      }
    } catch (e: any) {
      log.error(`✗ Migration failed: ${migrationName} - ${e.message}`);
      throw e;
    }
  }

  if (completed > 0) {
    log.info(`Successfully applied ${completed} new migration(s)`);
  } else {
    log.info('No new migrations to apply');
  }
}

/**
 * Rollback last migration
 */
export async function rollbackMigration(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (applied.length === 0) {
    log.warn('No migrations to rollback');
    return;
  }

  // Get the last applied migration
  const lastMigration = applied[applied.length - 1];
  const files = getMigrationFiles();
  const migrationFile = files.find(f => path.parse(f).name === lastMigration.name);

  if (!migrationFile) {
    log.error(`Could not find migration file for: ${lastMigration.name}`);
    throw new Error('Migration file not found');
  }

  try {
    log.info(`▶ Rolling back migration: ${lastMigration.name}`);
    const migration = await loadMigration(migrationFile);

    if (typeof migration.down === 'function') {
      await migration.down();
      await removeMigration(lastMigration.name);
      log.info(`✓ Migration rolled back: ${lastMigration.name}`);
    } else {
      log.warn(`⚠ Migration ${lastMigration.name} has no down() function`);
    }
  } catch (e: any) {
    log.error(`✗ Rollback failed: ${lastMigration.name} - ${e.message}`);
    throw e;
  }
}

/**
 * Rollback all migrations
 */
export async function rollbackAll(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  log.info(`Rolling back ${applied.length} migration(s)...`);

  // Rollback in reverse order
  for (let i = applied.length - 1; i >= 0; i--) {
    const migration = applied[i];
    const files = getMigrationFiles();
    const migrationFile = files.find(f => path.parse(f).name === migration.name);

    if (!migrationFile) {
      log.warn(`Migration file not found: ${migration.name}`);
      continue;
    }

    try {
      const mod = await loadMigration(migrationFile);
      if (typeof mod.down === 'function') {
        await mod.down();
        await removeMigration(migration.name);
        log.info(`✓ Rolled back: ${migration.name}`);
      }
    } catch (e: any) {
      log.error(`✗ Rollback failed: ${migration.name} - ${e.message}`);
      throw e;
    }
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  applied: MigrationRecord[];
  pending: string[];
  total: number;
}> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const appliedNames = new Set(applied.map(m => m.name));
  const files = getMigrationFiles();

  const pending = files
    .map(f => path.parse(f).name)
    .filter(name => !appliedNames.has(name));

  return {
    applied,
    pending,
    total: files.length,
  };
}
