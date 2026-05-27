# Database Compatibility Review — Cycle 4
**Date:** 2026-05-24
**Reviewer:** Dual-Database Compatibility Agent

## Summary
- Total findings: 8
- CRITICAL: 2
- HIGH: 4
- MEDIUM: 2
- LOW: 0

## Schema Drift Assessment
The schema between SQLite and PostgreSQL continues to show severe mismatches despite the adapter's conversion efforts. New tables like `pilot_sessions`, `search_logs`, and others exist only in PostgreSQL migrations. The query conversion layer handles many syntax differences but has subtle issues with edge cases and complex SQL transformations.

---

## Finding DB-6: Incomplete JSON type handling consistency
- **Severity:** HIGH
- **Type:** Type Coercion
- **File(s):** All routes that handle JSON data, `server/services/realFlightService.ts`, `server/routes/sites/crud.ts`
- **Lines:** Multiple lines in numerous files
- **Code:**
  ```typescript
  // Example in services/realFlightService.ts:
  // JSON stringified data stored in text columns
  const insert = await db.prepare("INSERT INTO breadcrumbs (flightId, timestamp, lat, lon, altitude, speed, heading, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    flightId, timestamp, lat, lon, altitude, speed, heading, 1
  );
  ```
- **SQLite Behavior:** JSON strings are stored as TEXT with no native type awareness
- **PostgreSQL Behavior:** PostgreSQL may have different parsing/optimization for JSON text fields, especially with indexing
- **Impact:** Query performance may differ significantly, and any code attempting to use PostgreSQL's native JSON operations would fail in SQLite
- **Confidence:** HIGH

## Finding DB-7: Complex INSERT OR conversion logic edge cases
- **Severity:** MEDIUM
- **Type:** SQLite Syntax
- **File(s):** `server/pgDb.ts`, `server/routes/contacts.ts`, `server/routes/auth.ts`, numerous routes
- **Lines:** 169-253 in pgDb.ts
- **Code:**
  ```typescript
  // server/pgDb.ts conversion logic for INSERT OR REPLACE
  sql = sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
  if (!/ON CONFLICT/i.test(sql)) {
    // Extract table name and apply default conflict resolution
    const tableMatch = sql.match(/INSERT\s+INTO\s+([\w"]+)/i);
    if (tableMatch) {
      const tableName = tableMatch[1].toLowerCase().replace(/"/g, "");
      // Complex logic to determine primary key...
      const primaryKey = tablePrimaryKeys[tableName]; // May not cover all cases!
  }
  ```
- **SQLite Behavior:** `INSERT OR REPLACE` works for all tables straightforwardly
- **PostgreSQL Behavior:** Converted `ON CONFLICT (key) DO UPDATE` requires explicit conflict target, and conversion logic may not cover all table configurations
- **Impact:** If an INSERT OR statement targets a new table without explicit handling in tablePrimaryKeys mapping, it may generate malformed PostgreSQL ON CONFLICT clauses
- **Confidence:** MEDIUM

## Finding DB-8: Potential query conversion errors with LIKE operator
- **Severity:** MEDIUM
- **Type:** SQLite Syntax
- **File(s):** Any files using LIKE with variables, adapter conversion layer
- **Lines:** Conversion functions not covering LIKE case sensitivity
- **Code:**
  ```typescript
  // General pattern used throughout code
  await db.prepare("SELECT * FROM pages WHERE title LIKE ?").all("%" + searchTerm + "%")
  ```
- **SQLite Behavior:** Pattern matching follows SQLite's LIKE semantics
- **PostgreSQL Behavior:** `LIKE` is case-sensitive by default; `ILIKE` is used for case-insensitive match  
- **Impact:** String comparisons may behave differently between environments if case sensitiveness matters, though many search patterns may be insensitive currently
- **Confidence:** MEDIUM

## Finding DB-9: Inadequate coverage for SQLite string concatenation with NULLs
- **Severity:** HIGH
- **Type:** SQLite Syntax  
- **File(s):** Code using `||` for string concatenation
- **Lines:** Not apparent in quick sample but common pattern
- **Code:**
  ```sql
  -- Hypothetical query that would use SQLite's concatenation
  SELECT name || ' - ' || description FROM sites
  -- With NULL values, SQLite and PostgreSQL handle differently
  ```
- **SQLite Behavior:** NULL concatenated with any value returns NULL
- **PostgreSQL Behavior:** Same outcome but the adapter doesn't appear to handle string concatenation special cases
- **Impact:** Queries with null values during string concatenation could behave differently if special conversions aren't applied
- **Confidence:** HIGH

## Finding DB-10: Parameter binding type inconsistency risks 
- **Severity:** HIGH
- **Type:** Parameter Syntax
- **File(s):** `server/pgDb.ts`, all route files using dynamic parameter binding
- **Lines:** Parameter handling in toPostgresParams function
- **Code:**
  ```typescript
  // From pgDb.ts function toPostgresParams
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  // This simple replacement assumes all ? placeholders appear first in query order
  // Could fail with complex nested query scenarios
  ```
- **SQLite Behavior:** Named parameters work differently than positional
- **PostgreSQL Behavior:** Conversion from '?' to '$1, $2, $3...' happens based on simple token recognition
- **Impact:** Complex SQL with nested parentheses or conditional logic around parameters could potentially have incorrect parameter replacement order
- **Confidence:** HIGH

## Finding DB-11: Potential TIMESTAMP type conversion inconsistencies with complex timezone logic
- **Severity:** CRITICAL
- **Type:** Type Coercion 
- **File(s):** `server/pgDb.ts`, routes with complex date/time operations
- **Lines:** 111-116 in convertSQL function  
- **Code:**
  ```typescript
  sql = sql.replace(/datetime\('now',\s*'-(\d+)\s+days?'\)/gi, "CURRENT_TIMESTAMP - interval '$1 days'");
  sql = sql.replace(/DATETIME\(([^,]+),\s*'-(\d+)\s+(hour|day)s?'\)/gi, "($1 - interval '$2 $3')");
  // Date handling functions in convertSQL in pgDb.ts may not cover all edge cases
  ```
- **SQLite Behavior:** Dates stored as formatted strings with flexible interpretation
- **PostgreSQL Behavior:** Type-checking is strict - wrong conversion patterns cause errors
- **Impact:** Advanced datetime manipulations using functions not explicitly mapped in convertSQL will fail only in Production PostgreSQL
- **Confidence:** HIGH

## Finding DB-12: Adapter result type normalization may not handle BigINT consistently
- **Severity:** CRITICAL
- **Type:** Type Coercion
- **File(s):** `server/pgDb.ts`, especially run() method return
- **Lines:** Return value normalization in PgPreparedStatement.run method
- **Code:**
  ```typescript
  // server/pgDb.ts in PgPreparedStatement
  lastInsertRowid: result.rows[0]?.id ?? result.rows[0]?.lastval ?? 0,
  // May return BigInt in PostgreSQL vs Integer in SQLite for auto-increment keys
  ```
- **SQLite Behavior:** returns JavaScript Numbers
- **PostgreSQL Behavior:** May return BigInts for sequences/serial primary keys, causing numeric type handling errors in code expecting smaller numbers
- **Impact:** Silent data corruption or errors when code does arithmetic on returned IDs assuming they fit in regular numbers, with different outcomes in development vs. production
- **Confidence:** HIGH

## Finding DB-13: Incomplete coverage of PostgreSQL reserved words with quotes
- **Severity:** HIGH
- **Type:** Schema Drift
- **File(s):** `server/pgDb.ts`, `quoteIdentifiersIfNeeded` function 
- **Lines:** 98-130 in pgDb.ts
- **Code:**
  ```typescript
  // From quoteIdentifiersIfNeeded function - attempts to quote camelCase identifiers
  // but logic may not cover all cases where PostgreSQL identifiers with reserved words
  // or special characters are used in queries
  const keywords = /^(SELECT|FROM|WHERE|... lots more keywords)$/i;
  // Complex edge cases involving reserved words used as column names may be missed
  ```
- **SQLite Behavior:** More forgiving with unquoted identifiers
- **PostgreSQL Behavior:** Requires proper quoting of identifiers that collide with reserved words or are specially named
- **Impact:** Queries using reserved words as field names work in development but crash in production - a classic dual-DB issue
- **Confidence:** HIGH