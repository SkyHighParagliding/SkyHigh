# Database Compatibility Review — Cycle 1
**Date:** 2026-05-24
**Reviewer:** Dual-Database Compatibility Agent

## Summary
- Total findings: 5
- CRITICAL: 3
- HIGH: 2
- MEDIUM: 0
- LOW: 0

## Schema Drift Assessment
The schema is severely out of sync between SQLite and PostgreSQL. The project has 53 SQLite migration files (001-053) but only 24 PostgreSQL migration files (001-024). This imbalance has led to critical divergences:

- PostgreSQL has `pilot_sessions`, `extended_wind_grids`, `search_logs` tables that don't exist in corresponding SQLite migrations.
- The SQLite database would experience crashes when code tries to access these newer tables introduced in later PostgreSQL migrations but missing from SQLite schema.
- The `check_ins` table exists in early SQLite migrations but was correctly dropped in migration 013, while PostgreSQL only has `checkins`.

---

## Finding DB-1: Missing pilot_sessions table in SQLite schema
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** `server/pg_migrations/008_add_pilot_sessions.sql`, various route files
- **Lines:** Multiple
- **Code:**
  ```typescript
  // server/pg_migrations/008_add_pilot_sessions.sql
  CREATE TABLE IF NOT EXISTS pilot_sessions (
    token TEXT PRIMARY KEY,
    "pilotId" TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  
  // server/routes/pilotAuth.ts - multiple usages
  await db.prepare("INSERT INTO pilot_sessions (token, pilotId) VALUES (?, ?)").run(token, id);
  ```
- **SQLite Behavior:** Application crashes with "no such table: pilot_sessions" error when pilot authentication features are used
- **PostgreSQL Behavior:** Works correctly
- **Impact:** Pilot authentication and session management completely fails in development environment but works in production, leading to difficult-to-diagnose issues
- **Confidence:** HIGH

## Finding DB-2: Missing extended_wind_grids table in SQLite
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** `server/pg_migrations/011_extended_wind_grid_cache.sql`
- **Lines:** Not shown in SQLite migrations
- **Code:**
  ```sql
  -- server/pg_migrations/011_extended_wind_grid_cache.sql
  CREATE TABLE IF NOT EXISTS extended_wind_grids (
    id TEXT PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "gridData" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **SQLite Behavior:** Application crashes with "no such table: extended_wind_grids" error when extended wind grid functionality is accessed
- **PostgreSQL Behavior:** Works correctly
- **Impact:** Wind grid caching feature works in production but crashes in development
- **Confidence:** HIGH

## Finding DB-3: Missing search_logs table in SQLite
- **Severity:** CRITICAL
- **Type:** Schema Drift
- **File(s):** `server/pg_migrations/023_search_logs.sql`, `server/routes/search.ts`
- **Lines:** Various
- **Code:**
  ```sql
  -- server/pg_migrations/023_search_logs.sql
  CREATE TABLE IF NOT EXISTS search_logs (
    id SERIAL PRIMARY KEY,
    search_type TEXT NOT NULL,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  -- server/routes/search.ts code using it
  await db.prepare("INSERT INTO search_logs (search_type, query, response) VALUES (?, ?, ?)").run("public", query, response);
  ```
- **SQLite Behavior:** Application crashes when search logging is enabled (controlled by settings)
- **PostgreSQL Behavior:** Works correctly
- **Impact:** Search functionality fails only in development if logging is enabled
- **Confidence:** HIGH

## Finding DB-4: Query parameter inconsistency in adapter conversion
- **Severity:** HIGH
- **Type:** Parameter Syntax
- **File(s):** `server/pgDb.ts`
- **Lines:** 85-130
- **Code:**
  ```typescript
  // Server attempts to detect mixed parameter types and throw an error:
  const hasQ = /\?/.test(sql);
  const hasAt = /@[a-zA-Z_]/.test(sql);
  if (hasQ && hasAt) {
    throw new Error(`SQL query mixes ? and @param placeholders: ${sql.substring(0, 100)}`);
  }
  // However, the conversion logic in toPostgresParams function may not handle all cases properly
  ```
- **SQLite Behavior:** Uses `?` placeholders directly
- **PostgreSQL Behavior:** Converts `?` to `$1, $2, ...` automatically
- **Impact:** Complex queries mixing multiple parameter styles could potentially cause confusion, though the current safeguard handles the most obvious case
- **Confidence:** MEDIUM

## Finding DB-5: Schema converter inconsistency for newer table additions
- **Severity:** HIGH
- **Type:** Schema Drift
- **File(s):** `server/db.ts`, all route files referencing new tables
- **Lines:** 86-98 and 182-221
- **Code:**
  ```typescript
  // server/db.ts - Migration runner reads from getMigrationsDir() which loads pg_migrations/
  // and runs SQLite-compatible conversion.
  // However, if a developer adds a new pg migration without a corresponding
  // conversion-compatible version that works with SQLite, the tables won't exist in SQLite
  function convertSchemaToSqlite(sql: string): string {
    let result = sql;
    // Converts PostgreSQL-specific syntax to SQLite compatible
    // But doesn't handle MISSING tables
  }
  ```
- **SQLite Behavior:** Tables created only in PostgreSQL migrations simply don't exist
- **PostgreSQL Behavior:** All tables exist as expected
- **Impact:** New feature rollouts affect development environment differently than production
- **Confidence:** HIGH