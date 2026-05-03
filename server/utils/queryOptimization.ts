/**
 * Query optimization utilities to prevent N+1 queries and improve performance
 */

import db from '../db.js';
import createLogger from './logger.js';

const log = createLogger('query-optimization');

/**
 * Batch load related records to prevent N+1 queries
 * Example: Load all site weather data in one query instead of one per site
 */
export async function batchLoad<T extends { id: string }>(
  records: T[],
  loadFn: (ids: string[]) => Promise<Record<string, any>>,
  mergeKey: keyof T = 'id'
): Promise<(T & Record<string, any>)[]> {
  if (records.length === 0) {
    return [];
  }

  const ids = records.map(r => String(r[mergeKey]));
  const related = await loadFn(ids);

  return records.map(record => ({
    ...record,
    ...(related[String(record[mergeKey])] || {}),
  }));
}

/**
 * Load related data for multiple records efficiently
 * Example: Load all comments for a list of posts
 */
export async function loadRelated<T extends { id: string }>(
  records: T[],
  relatedTable: string,
  foreignKeyColumn: string,
  localKeyColumn: string = 'id'
): Promise<Map<string, any[]>> {
  if (records.length === 0) {
    return new Map();
  }

  const ids = records.map(r => r[localKeyColumn as keyof T]);
  const idPlaceholders = ids.map(() => '?').join(',');

  try {
    const related = await db.prepare(
      `SELECT * FROM ${relatedTable} WHERE ${foreignKeyColumn} IN (${idPlaceholders})`
    ).all(...ids) as any[];

    // Group by foreign key
    const grouped = new Map<string, any[]>();
    for (const record of related) {
      const key = record[foreignKeyColumn];
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(record);
    }

    return grouped;
  } catch (e: any) {
    log.error(`Failed to load related records: ${e.message}`);
    return new Map();
  }
}

/**
 * Cache expensive query results in memory for the request lifetime
 */
export class RequestCache {
  private cache = new Map<string, any>();

  set<T>(key: string, value: T): T {
    this.cache.set(key, value);
    return value;
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }

  getOrCompute<T>(key: string, fn: () => T | Promise<T>): T | Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = fn();
    if (result instanceof Promise) {
      return result.then(r => {
        this.cache.set(key, r);
        return r;
      });
    }

    this.cache.set(key, result);
    return result;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Deduplicate query results
 * Example: User requests same data twice - return cached version
 */
export function dedupQueries<T extends { id: string }>(
  records: T[]
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const record of records) {
    if (!seen.has(record.id)) {
      seen.add(record.id);
      deduped.push(record);
    }
  }

  if (deduped.length < records.length) {
    log.info(`Deduplicated ${records.length - deduped.length} duplicate records`);
  }

  return deduped;
}

/**
 * Filter query results to avoid multiple queries
 * Example: Get all sites and filter locally instead of querying each filter condition
 */
export function filterInMemory<T>(
  records: T[],
  predicates: Array<(record: T) => boolean>
): T[] {
  return records.filter(record =>
    predicates.every(predicate => predicate(record))
  );
}

/**
 * Lazy-load resources only when needed
 */
export class LazyLoader<T> {
  private value: T | undefined;
  private loaded = false;

  constructor(private loader: () => Promise<T>) {}

  async get(): Promise<T> {
    if (!this.loaded) {
      this.value = await this.loader();
      this.loaded = true;
    }
    return this.value!;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

/**
 * Measure query performance
 */
export async function measureQuery<T>(
  name: string,
  query: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await query();
    const duration = Date.now() - start;

    if (duration > 100) {
      log.warn(`Slow query "${name}": ${duration}ms`);
    } else {
      log.info(`Query "${name}": ${duration}ms`);
    }

    return result;
  } catch (e: any) {
    const duration = Date.now() - start;
    log.error(`Query "${name}" failed after ${duration}ms: ${e.message}`);
    throw e;
  }
}

/**
 * Batch queries into fewer database round trips
 */
export async function batchQueries<T>(
  queries: Array<() => Promise<T>>
): Promise<T[]> {
  const results = await Promise.all(queries.map(q => q().catch(e => {
    log.error(`Batch query failed: ${e.message}`);
    return undefined;
  })));

  return results.filter((r): r is T => r !== undefined);
}

/**
 * Simple result caching with TTL
 */
export class CacheWithTTL<T> {
  private cache: { value: T; expiresAt: number } | undefined;

  constructor(private ttlMs: number) {}

  set(value: T): void {
    this.cache = {
      value,
      expiresAt: Date.now() + this.ttlMs,
    };
  }

  get(): T | undefined {
    if (!this.cache) {
      return undefined;
    }

    if (this.cache.expiresAt < Date.now()) {
      this.cache = undefined;
      return undefined;
    }

    return this.cache.value;
  }

  isExpired(): boolean {
    return !this.cache || this.cache.expiresAt < Date.now();
  }

  clear(): void {
    this.cache = undefined;
  }
}

/**
 * Avoid selecting unnecessary columns (use SELECT specific columns, not *)
 */
export function selectSpecificColumns<T>(
  columns: (keyof T)[]
): string {
  return columns.map(c => String(c)).join(', ');
}
