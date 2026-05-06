/**
 * Database maintenance and deployment utilities
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import db from '../db.js';
import createLogger from './logger.js';

const log = createLogger('database-maintenance');
const execAsync = promisify(exec);

const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Monitor and log slow queries
 */
export async function monitorSlowQueries(
  query: string,
  params: any[],
  startTime: number
): Promise<void> {
  const duration = Date.now() - startTime;

  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    log.warn(`Slow query detected (${duration}ms): ${query.substring(0, 100)}...`);

    if (duration > 1000) {
      log.error(`CRITICAL slow query (${duration}ms): ${query.substring(0, 200)}`);
    }
  }
}

/**
 * Database statistics for monitoring
 */
export async function getDbStatistics() {
  try {
    // Get table sizes and row counts
    const tables = await db.prepare(`
      SELECT
        name,
        (SELECT COUNT(*) FROM sqlite_master WHERE tbl_name=name AND type='index') as indexes
      FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as any[];

    const stats: Record<string, any> = {};

    for (const table of tables) {
      const count = await db.prepare(`SELECT COUNT(*) as cnt FROM ${table.name}`).get() as { cnt: number };
      stats[table.name] = {
        rows: count.cnt,
        indexes: table.indexes,
      };
    }

    return stats;
  } catch (e: any) {
    log.error(`Failed to get database statistics: ${e.message}`);
    return {};
  }
}

/**
 * Check database integrity
 */
export async function checkDatabaseIntegrity(): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Run PRAGMA integrity_check
    const result = await db.prepare('PRAGMA integrity_check').get() as any;

    if (result.integrity_check !== 'ok') {
      errors.push(`Integrity check failed: ${result.integrity_check}`);
    }

    // Check for foreign key violations
    const fkCheck = await db.prepare('PRAGMA foreign_key_check').all() as any[];
    if (fkCheck.length > 0) {
      errors.push(`Foreign key violations: ${fkCheck.length} found`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (e: any) {
    log.error(`Database integrity check failed: ${e.message}`);
    return {
      valid: false,
      errors: [e.message],
    };
  }
}

/**
 * Optimize database (analyze, vacuum, reindex)
 */
export async function optimizeDatabase(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    log.info('Starting database optimization...');

    // Analyze tables for query planning
    await db.prepare('ANALYZE').run();
    log.info('✓ Analyzed tables');

    // Rebuild indexes
    await db.prepare('REINDEX').run();
    log.info('✓ Reindexed');

    // Vacuum database (compact and rebuild)
    await db.prepare('VACUUM').run();
    log.info('✓ Vacuumed');

    return {
      success: true,
      message: 'Database optimization complete',
    };
  } catch (e: any) {
    log.error(`Database optimization failed: ${e.message}`);
    return {
      success: false,
      message: e.message,
    };
  }
}

/**
 * Create database backup
 */
export async function createBackup(backupDir: string = './backups'): Promise<{
  success: boolean;
  path?: string;
  message: string;
}> {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `db-backup-${timestamp}.sql`);

    // For SQLite, we can use .dump command or copy the file
    // This is a simplified approach - in production, use proper backup tools
    const databasePath = process.env.DATABASE_URL || './database/db.sqlite';

    if (databasePath.startsWith('sqlite://')) {
      const actualPath = databasePath.replace('sqlite://', '');
      fs.copyFileSync(actualPath, backupPath);
    } else {
      // For PostgreSQL, use pg_dump if available
      if (process.env.DATABASE_URL?.startsWith('postgresql')) {
        await execAsync(`pg_dump "${process.env.DATABASE_URL}" > "${backupPath}"`);
      }
    }

    log.info(`Database backed up to: ${backupPath}`);
    return {
      success: true,
      path: backupPath,
      message: `Backup created successfully: ${backupPath}`,
    };
  } catch (e: any) {
    log.error(`Backup failed: ${e.message}`);
    return {
      success: false,
      message: `Backup failed: ${e.message}`,
    };
  }
}

/**
 * List available backups
 */
export function listBackups(backupDir: string = './backups'): string[] {
  try {
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith('db-backup-'))
      .sort()
      .reverse();
  } catch (e: any) {
    log.error(`Failed to list backups: ${e.message}`);
    return [];
  }
}

/**
 * Connection pool monitoring
 */
export function getPoolMetrics(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  utilization: number;
} {
  // This would be implementation-specific based on your connection pool
  // For pg library, you can access pool properties
  return {
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    utilization: 0,
  };
}

/**
 * Schedule automated backups
 */
export function scheduleAutomatedBackups(
  intervalMinutes: number = 60,
  backupDir: string = './backups'
): NodeJS.Timeout {
  log.info(`Scheduling automated backups every ${intervalMinutes} minutes`);

  return setInterval(async () => {
    const result = await createBackup(backupDir);
    if (!result.success) {
      log.error(`Scheduled backup failed: ${result.message}`);
    }
  }, intervalMinutes * 60 * 1000);
}

/**
 * Monitor database performance metrics
 */
export async function getPerformanceMetrics() {
  try {
    const stats = await getDbStatistics();
    const integrity = await checkDatabaseIntegrity();
    const pool = getPoolMetrics();

    return {
      timestamp: new Date().toISOString(),
      tables: stats,
      integrity,
      pool,
    };
  } catch (e: any) {
    log.error(`Failed to get performance metrics: ${e.message}`);
    return null;
  }
}

/**
 * Cleanup old data (archiving strategy)
 */
export async function cleanupOldData(
  tableName: string,
  dateColumn: string,
  retentionDays: number
): Promise<{ deleted: number }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db.prepare(
      `DELETE FROM ${tableName} WHERE ${dateColumn} < ?`
    ).run(cutoffDate.toISOString());

    log.info(`Cleaned up ${result.changes} old records from ${tableName}`);

    return { deleted: result.changes };
  } catch (e: any) {
    log.error(`Cleanup failed: ${e.message}`);
    return { deleted: 0 };
  }
}

/**
 * Health check specifically for database deployment
 */
export async function getDeploymentHealth() {
  try {
    // Test connectivity
    await db.prepare('SELECT 1').get();

    // Check integrity
    const integrity = await checkDatabaseIntegrity();

    // Get statistics
    const stats = await getDbStatistics();

    return {
      healthy: integrity.valid,
      connectivity: 'ok',
      integrity: integrity.valid ? 'ok' : 'degraded',
      tables: Object.keys(stats).length,
      totalRows: Object.values(stats).reduce((sum: number, table: any) => sum + table.rows, 0),
    };
  } catch (e: any) {
    return {
      healthy: false,
      connectivity: 'failed',
      integrity: 'unknown',
      error: e.message,
    };
  }
}
