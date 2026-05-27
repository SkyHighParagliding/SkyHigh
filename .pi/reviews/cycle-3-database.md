# Database Compatibility Review — Cycle 3
**Date:** 2026-05-24
**Reviewer:** Dual-Database Compatibility Agent

## Summary
- Total findings: 9
- CRITICAL: 4
- HIGH: 4
- MEDIUM: 1
- LOW: 0

## Schema Drift Assessment
Major schema drift continues to be the biggest database compatibility threat:
- PostgreSQL has multiple tables introduced in recent migrations (011_extended_wind_grid_cache.sql, 020_site_closure_dates.sql, 023_search_logs.sql) that do NOT exist in SQLite
- `search_logs` table exists on production but crashes in development as reported in previous reviews
- `site_closure_dates` table introduced as "the biggest source of production bugs" still remains absent from development SQLite
- `extended_wind_grids` table for wind interpolation cache missing from SQLite

---

## Finding DB-1: Missing search_logs Table in SQLite Schema
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** `server/routes/searchLogs.ts`, `server/routes/search.ts`
- **Lines:** Various (lines 60-61, 72-76, 115-119, 124-125)
- **Code:**
```typescript
// From server/routes/search.ts - search logging function:
await db.prepare("INSERT INTO search_logs (search_type, query, response) VALUES (?, ?, ?)").run("public", query, response);

// From server/routes/searchLogs.ts - various operations:
const countRow = await db.prepare("SELECT COUNT(*) as total FROM search_logs").get() as { total: number | string };
const sizeRow = await db.prepare("SELECT SUM(LENGTH(query) + LENGTH(response)) as bytes FROM search_logs").get() as { bytes: number | null };
await db.prepare("DELETE FROM search_logs").run();
```
- **SQLite Behavior:** Query fails with "Error: no such table: search_logs" when search logging is enabled in development 
- **PostgreSQL Behavior:** Works correctly in production, storing and retrieving search query logs
- **Impact:** Feature is completely disabled in development despite being core functionality that needs testing. Code relying on search logging will crash during development when logging is intended to be active.
- **Confidence:** HIGH

## Finding DB-2: Missing extended_wind_grids Table in SQLite
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** Files using wind grid interpolations not yet discovered - need to locate usage of this table
- **Lines:** Various locations that use this table (if any exist)
- **Code:** 
```sql
-- From server/pg_migrations/011_extended_wind_grid_cache.sql:
CREATE TABLE IF NOT EXISTS extended_wind_grids (
  id TEXT PRIMARY KEY,
  "windData" TEXT NOT NULL,
  "computedAt" TEXT NOT NULL
);
```
- **SQLite Behavior:** This caching table is absent from development, potentially causing missing table errors or forcing redundant computation
- **PostgreSQL Behavior:** Exists for caching interpolated wind grid data in production
- **Impact:** Development environment cannot properly test wind calculation features that would utilize this cache. Potentially impacts performance calculations.
- **Confidence:** HIGH

## Finding DB-3: Missing Extended Forecasts Data Structures in SQLite
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** `server/routes/sites/crud.ts`, `server/routes/search.ts`
- **Lines:** Various related database calls
- **Code:**
```sql
-- From server/pg_migrations/001_full_schema.sql:
CREATE TABLE IF NOT EXISTS site_extended_forecasts (
  "siteId" TEXT PRIMARY KEY,
  "forecastData" TEXT,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extended_forecasts (
  id TEXT PRIMARY KEY DEFAULT 'extended_grid',
  "gridData" TEXT,
  "fetchedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```
- **SQLite Behavior:** Tables may be missing due to the migration process differences
- **PostgreSQL Behavior:** Properly exists with time zone aware timestamp types  
- **Impact:** Extended forecast features not testable in development environment, causing deployment risks
- **Confidence:** HIGH

## Finding DB-4: Migration Strategy Differences Causing Schema Drift 
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** `server/db.ts`, `server/utils/migrations.ts`
- **Lines:** Lines handling migration processing in `db.ts` vs `migrations.ts`
- **Code:**
```typescript
// From server/db.ts function runSQLiteMigrations():
const migrationsDir = getMigrationsDir();
// Always uses pg_migrations/ — these are SQL files written in Postgres syntax
// that get converted to SQLite on-the-fly.

// From server/utils/migrations.ts:
// Uses a different system entirely based on server/migrations/
// which appears to have different logic
```
- **SQLite Behavior:** Migrates data using PostgreSQL syntax from `pg_migrations/` that gets converted with various substitution regex patterns
- **PostgreSQL Behavior:** Uses raw PostgreSQL syntax directly from `pg_migrations/`
- **Impact:** The conversion process is lossy and introduces errors. Some SQL constructs may not convert properly, causing the two databases to drift over time
- **Confidence:** HIGH

## Finding DB-5: Complex ON CONFLICT Implementation Issues
- **Severity:** HIGH
- **Type:** SQLite Syntax to PostgreSQL Conversion
- **File(s):** `server/pgDb.ts`, `server/routes/searchLogs.ts`, `server/routes/sites/closures.ts`
- **Lines:** `pgDb.ts` lines 113-196 (conversion function)
- **Code:**
```typescript
// From server/pgDb.ts convertSQL() function - handling of UPSERTS:
// Convert INSERT OR REPLACE -> INSERT ... ON CONFLICT UPDATE
if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(sql)) {
  sql = sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
  if (!/ON CONFLICT/i.test(sql)) {
    // Specific table handling with hardcoded logic
    if (sql.toLowerCase().includes("into settings")) {
      sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT (key) DO UPDATE SET \"value\" = EXCLUDED.\"value\"";
    }
    // .. more table-specific logic
  }
}
```
- **SQLite Behavior:** Uses `INSERT OR REPLACE`, a SQLite extension for upserts
- **PostgreSQL Behavior:** Translator rewrites to `INSERT ... ON CONFLICT` with limited table-specific understanding
- **Impact:** The hardcoded table names in the translator mean new tables with `INSERT OR REPLACE` syntax may not be correctly translated
- **Confidence:** HIGH

## Finding DB-6: Inconsistent Transaction Handling Across Databases 
- **Severity:** HIGH
- **Type:** Adapter Gap
- **File(s):** `server/pgDb.ts`, `server/sqliteDb.ts`
- **Lines:** `pgDb.ts` lines 211-235, `sqliteDb.ts` lines 38-64
- **Code:**
```typescript
// From pgDb.ts transaction method:
transaction<T>(fn: (...args: any[]) => Promise<T>) {
  return async (...args: any[]): Promise<T> => {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(...args);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  };
}

// From sqliteDb.ts transaction implementation - significantly different approach:
// Uses a mutex pattern with BEGIN/COMMIT for sync transactions but async operations are handled differently
```
- **SQLite Behavior:** Uses synchronous transaction with mutex pattern and direct SQLite transaction control
- **PostgreSQL Behavior:** Uses async pool connections and client-level transaction control
- **Impact:** Timing differences and potential locking behavior disparities could cause subtle differences in multi-user scenarios
- **Confidence:** HIGH

## Finding DB-7: Identifier Quoting Issues with CamelCase Preservation
- **Severity:** MEDIUM
- **Type:** Schema Drift
- **File(s):** `server/pgDb.ts`
- **Lines:** Lines 66-97 in `quoteIdentifiersIfNeeded` function
- **Code:**
```typescript
function quoteIdentifiersIfNeeded(sql: string): string {
  // Quote camelCase column names to preserve case in PostgreSQL.
  // This handles identifiers in SELECT, WHERE, SET, JOIN ON, etc.
  // ...
  // Matches identifiers and quotes camelCase ones
  if (/[A-Z]/.test(identifier)) {
    return ${before}"${identifier}"`;
  }
  return match;
}
```
- **SQLite Behavior:** Case sensitivity varies depending on OS and compilation, but generally preserves case by default
- **PostgreSQL Behavior:** Converts unquoted identifiers to lowercase by default, requiring quotes for camelCase
- **Impact:** Inconsistencies could occur if code relies on case-sensitive column names, though this might work in both databases due to this quoting mechanism
- **Confidence:** MEDIUM

## Finding DB-8: Parameter Placeholder Conflicts with String Content
- **Severity:** HIGH 
- **Type:** Parameter Syntax
- **File(s):** `server/pgDb.ts`
- **Lines:** Lines 44-62 in `toPostgresParams` function
- **Code:**
```typescript
function toPostgresParams(sql: string, params: any[]): { sql: string; values: any[] } {
  // Handle positional ? params → $1, $2, ...
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  return { sql: converted, values: params };
}
```
- **SQLite Behavior:** Uses `?` as placeholders
- **PostgreSQL Behavior:** Converts `?` -> `$1, $2, ...`
- **Impact:** If SQL queries contain question marks in string literals (e.g. LIKE patterns or data content), these will be incorrectly converted to PostgreSQL parameter placeholders, causing syntax errors
- **Confidence:** HIGH

## Finding DB-9: TIMESTAMP Handling and Zone Differences
- **Severity:** HIGH
- **Type:** Type Coercion
- **File(s):** `server/pgDb.ts`, code using timestamps like `realFlightService.ts`
- **Lines:** `pgDb.ts` lines 98-113 in `convertSQL` function
- **Code:**
```typescript
// From pgDb.ts
sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+hours?',\s*'start of day'\)/gi, "(CURRENT_TIMESTAMP - interval '$1 hours')");
sql = sql.replace(/datetime\('now',\s*'start of day'\)/gi, "CURRENT_DATE::timestamptz");
sql = sql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
```
- **SQLite Behavior:** Stores `datetime` results as TEXT/STRING in ISO format
- **PostgreSQL Behavior:** Uses `TIMESTAMPTZ` with timezone awareness
- **Impact:** Applications that expect consistent data types could experience issues if comparing or sorting datetime values differently in dev vs prod, or processing date strings vs Date objects
- **Confidence:** HIGH