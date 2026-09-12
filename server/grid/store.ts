/**
 * Persistence helpers for the wind_grid_data table.
 *
 * The single canonical implementation of grid persistence. Key scheme and
 * JSON column name are preserved exactly so rows already in production
 * remain readable.
 *
 * Key scheme: `${baseKey}_${YYYY-MM-DD}` (Melbourne local date).
 * Example:    "fine_grid_2026-09-12", "thermal_grid_2026-09-12"
 */

import { query, queryOne, execute } from "../pg.js";
import createLogger from "../utils/logger.js";

const log = createLogger("grid:store");

// ---------------------------------------------------------------------------
// Date helper
// ---------------------------------------------------------------------------

/** Current date in Melbourne local time, formatted as YYYY-MM-DD. */
export function melbourneToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

// ---------------------------------------------------------------------------
// LIKE-pattern safety
// ---------------------------------------------------------------------------

/**
 * Escapes underscores in a string used inside a PostgreSQL LIKE pattern.
 * Underscores are SQL wildcards — base keys like "fine_grid" contain them and
 * must be escaped so the LIKE only matches on the date suffix, not arbitrary
 * characters.
 */
function escapeLike(key: string): string {
  return key.replace(/_/g, "\\_");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Reads the grid for a specific day (defaults to Melbourne today).
 * Returns `null` when no row exists for that day.
 */
export async function readGrid<T>(
  baseKey: string,
  day?: string,
): Promise<{ grid: T; updatedAt: Date } | null> {
  const date = day ?? melbourneToday();
  const siteId = `${baseKey}_${date}`;
  try {
    const row = await queryOne<{ gridData: string; updatedAt: string }>(
      `SELECT "gridData", "updatedAt" FROM wind_grid_data WHERE "siteId" = $1`,
      [siteId],
    );
    if (!row) return null;
    return {
      grid: JSON.parse(row.gridData) as T,
      updatedAt: new Date(row.updatedAt),
    };
  } catch (err) {
    log.error(`readGrid failed for ${siteId}`, err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * Reads the newest row for a base key regardless of date.
 * Used as the "keep previous cache" fallback when a fresh fetch comes up short.
 * Returns `null` when no rows exist at all for this base key.
 */
export async function readLatestGrid<T>(baseKey: string): Promise<T | null> {
  const pattern = `${escapeLike(baseKey)}\\_%`;
  try {
    const rows = await query<{ gridData: string }>(
      `SELECT "gridData" FROM wind_grid_data
       WHERE "siteId" LIKE $1 ESCAPE '\\'
       ORDER BY "siteId" DESC
       LIMIT 1`,
      [pattern],
    );
    if (rows.length === 0) return null;
    return JSON.parse(rows[0].gridData) as T;
  } catch (err) {
    log.error(`readLatestGrid failed for ${baseKey}`, err instanceof Error ? err.message : err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Upserts a grid for the given day.
 * `gridSize` and `gridSpacing` are not used by the new orchestrator path but
 * are preserved in the upsert so existing rows keep their values and the
 * schema stays compatible with pre-refactor reads.
 */
export async function writeGrid(
  baseKey: string,
  day: string,
  grid: unknown,
): Promise<void> {
  const siteId = `${baseKey}_${day}`;
  const json = JSON.stringify(grid);
  try {
    await execute(
      `INSERT INTO wind_grid_data ("siteId", "gridData", "gridSize", "gridSpacing", "updatedAt")
       VALUES ($1, $2, 0, 0, CURRENT_TIMESTAMP)
       ON CONFLICT ("siteId") DO UPDATE
         SET "gridData"   = EXCLUDED."gridData",
             "updatedAt"  = EXCLUDED."updatedAt"`,
      [siteId, json],
    );
    log.info(`writeGrid: stored ${(json.length / 1024 / 1024).toFixed(1)} MB for ${siteId}`);
  } catch (err) {
    log.error(`writeGrid failed for ${siteId}`, err instanceof Error ? err.message : err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Deletes rows older than `keepDays` for the given base key.
 * The cutoff is the Melbourne date `keepDays` days ago; anything strictly
 * before that date is deleted.
 */
export async function cleanupOldGrids(
  baseKey: string,
  keepDays: number,
): Promise<void> {
  const cutoffDate = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD
  const pattern = `${escapeLike(baseKey)}\\_%`;
  const cutoffKey = `${baseKey}_${cutoffDate}`;
  try {
    const result = await execute(
      `DELETE FROM wind_grid_data
       WHERE "siteId" LIKE $1 ESCAPE '\\'
         AND "siteId" < $2`,
      [pattern, cutoffKey],
    );
    if (result.rowCount > 0) {
      log.info(`cleanupOldGrids: removed ${result.rowCount} rows older than ${cutoffDate} for ${baseKey}`);
    }
  } catch (err) {
    log.error(`cleanupOldGrids failed for ${baseKey}`, err instanceof Error ? err.message : err);
    // Non-fatal — log and swallow.
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Upserts a settings value used purely for admin-panel reporting (live progress,
 * provenance). Errors are swallowed — a failed status write must never abort or
 * fail a grid fetch.
 */
export async function setStatus(key: string, value: string): Promise<void> {
  try {
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  } catch {
    // Non-fatal: silently swallow so the caller's fetch is not disrupted.
  }
}
