/**
 * Edge case handling utilities to prevent common bugs
 */

import db from '../db.js';
import createLogger from './logger.js';

const log = createLogger('edge-cases');

/**
 * Safe delete with cascade checks
 * Prevents orphaned records and constraint violations
 */
export async function safeDeleteWithCascade(
  tableName: string,
  idColumn: string,
  id: string | number,
  cascades: Array<{ table: string; column: string }> = []
): Promise<{ deleted: boolean; cascaded: number }> {
  try {
    let cascadedCount = 0;

    // Delete cascaded records first
    for (const cascade of cascades) {
      const result = await db.prepare(
        `DELETE FROM ${cascade.table} WHERE ${cascade.column} = ?`
      ).run(id);
      cascadedCount += result.changes;
    }

    // Delete main record
    const result = await db.prepare(
      `DELETE FROM ${tableName} WHERE ${idColumn} = ?`
    ).run(id);

    if (result.changes === 0) {
      log.warn(`Record not found for deletion: ${tableName}.${idColumn}=${id}`);
      return { deleted: false, cascaded: cascadedCount };
    }

    log.info(`Deleted ${cascadedCount} cascaded records and 1 main record`);
    return { deleted: true, cascaded: cascadedCount };
  } catch (e: any) {
    log.error(`Cascade delete failed: ${e.message}`);
    throw e;
  }
}

/**
 * Safe update with conflict detection
 * Prevents lost updates in concurrent scenarios
 */
export async function safeUpdateWithVersion(
  tableName: string,
  id: string | number,
  updates: Record<string, any>,
  currentVersion: number
): Promise<{ updated: boolean; conflict: boolean; version: number }> {
  try {
    // Check current version before updating
    const current = await db.prepare(
      `SELECT version FROM ${tableName} WHERE id = ?`
    ).get(id) as { version: number } | undefined;

    if (!current) {
      log.warn(`Record not found for update: ${tableName}.id=${id}`);
      return { updated: false, conflict: false, version: 0 };
    }

    if (current.version !== currentVersion) {
      log.warn(`Version conflict: expected ${currentVersion}, got ${current.version}`);
      return { updated: false, conflict: true, version: current.version };
    }

    // Perform update with new version
    const newVersion = currentVersion + 1;
    const setClause = Object.keys(updates)
      .map(k => `${k} = ?`)
      .join(', ');
    const values = [...Object.values(updates), newVersion, id, currentVersion];

    const result = await db.prepare(
      `UPDATE ${tableName} SET ${setClause}, version = ? WHERE id = ? AND version = ?`
    ).run(...values);

    if (result.changes === 0) {
      log.warn(`Concurrent update detected: version changed during update`);
      return { updated: false, conflict: true, version: newVersion };
    }

    return { updated: true, conflict: false, version: newVersion };
  } catch (e: any) {
    log.error(`Safe update failed: ${e.message}`);
    throw e;
  }
}

/**
 * Safe increment operation
 * Prevents race conditions in counters
 */
export async function safeIncrement(
  tableName: string,
  id: string | number,
  column: string,
  increment: number = 1
): Promise<number> {
  try {
    const result = await db.prepare(
      `UPDATE ${tableName} SET ${column} = ${column} + ? WHERE id = ?`
    ).run(increment, id);

    if (result.changes === 0) {
      log.warn(`Record not found for increment: ${tableName}.id=${id}`);
      return 0;
    }

    return increment;
  } catch (e: any) {
    log.error(`Safe increment failed: ${e.message}`);
    throw e;
  }
}

/**
 * Validate enum values to prevent invalid states
 */
export function validateEnum(
  value: string | undefined,
  allowedValues: string[],
  fieldName: string,
  defaultValue?: string
): string {
  if (!value) {
    if (defaultValue && allowedValues.includes(defaultValue)) {
      return defaultValue;
    }
    throw new Error(`${fieldName} is required and must be one of: ${allowedValues.join(', ')}`);
  }

  if (!allowedValues.includes(value)) {
    throw new Error(`Invalid ${fieldName}: "${value}". Must be one of: ${allowedValues.join(', ')}`);
  }

  return value;
}

/**
 * Safe array access with bounds checking
 */
export function safeArrayAccess<T>(
  array: T[] | undefined | null,
  index: number,
  defaultValue?: T
): T | undefined {
  if (!Array.isArray(array)) {
    return defaultValue;
  }

  if (index < 0 || index >= array.length) {
    return defaultValue;
  }

  return array[index];
}

/**
 * Safe numeric parsing with bounds
 */
export function safeParseNumber(
  value: string | number | undefined,
  min?: number,
  max?: number,
  defaultValue: number = 0
): number {
  let num: number;

  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    num = parseInt(value, 10);
    if (isNaN(num)) {
      return defaultValue;
    }
  } else {
    return defaultValue;
  }

  if (min !== undefined && num < min) {
    return min;
  }

  if (max !== undefined && num > max) {
    return max;
  }

  return num;
}

/**
 * Safe date parsing with validation
 */
export function safeParseDate(
  value: string | Date | undefined,
  defaultDate?: Date
): Date | undefined {
  if (!value) {
    return defaultDate;
  }

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return defaultDate;
    }
    return date;
  } catch {
    return defaultDate;
  }
}

/**
 * Detect and prevent null/undefined dereference
 */
export function safeGet<T, K extends keyof T>(
  obj: T | undefined | null,
  key: K,
  defaultValue?: T[K]
): T[K] | undefined {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const value = obj[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Validate required fields in request body
 */
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of fields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Prevent SQL injection through identifier validation
 */
export function validateIdentifier(
  value: string,
  maxLength: number = 64
): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Identifier is required' };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `Identifier exceeds max length of ${maxLength}` };
  }

  // Allow alphanumeric, hyphen, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return { valid: false, error: 'Identifier contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Prevent array index out of bounds
 */
export function validateArrayIndex(
  index: number,
  arrayLength: number
): { valid: boolean; error?: string } {
  if (!Number.isInteger(index)) {
    return { valid: false, error: 'Index must be an integer' };
  }

  if (index < 0) {
    return { valid: false, error: 'Index cannot be negative' };
  }

  if (index >= arrayLength) {
    return { valid: false, error: `Index ${index} out of bounds for array of length ${arrayLength}` };
  }

  return { valid: true };
}
