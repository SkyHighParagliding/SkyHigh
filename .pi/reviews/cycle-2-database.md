# Database Compatibility Review — Cycle 2
**Date:** 2026-05-23
**Reviewer:** Dual-Database Compatibility Agent

## Summary
- Total findings: 4
- CRITICAL: 1
- HIGH: 0
- MEDIUM: 2
- LOW: 1

## Schema Drift Assessment

The project has transitioned to a **unified migration strategy**: all migrations (SQLite and PostgreSQL) now read from `server/pg_migrations/`, with `server/db.ts` converting PostgreSQL syntax to SQLite on-the-fly via `convertSchemaToSqlite()`. This eliminates the old risk of the 53-SQLite-migration / 22-PostgreSQL-migration folder divergence. Each `.sql` file is executed verbatim on PostgreSQL, and after text-conversion on SQLite.

### Tables verified present in both schemas
Verified via `001_full_schema.sql` + all subsequent pg_migrations (002–025):
`admin_users`, `admin_sessions`, `sites`, `external_site_listings`, `checkins`, `pages`, `news`, `settings`, `contacts`, `projects`, `project_contacts`, `project_documents`, `documents`, `weather_observations`, `weather_forecasts`, `wind_grid_data`, `site_extended_forecasts`, `extended_forecasts`, `extended_wind_grids`, `safety_officers`, `page_views`, `procedures`, `siteguide_version_checks`, `site_archives`, `site_closure_dates`, `document_index`, `emergency_hospitals_cache`, `password_reset_tokens`, `image_submissions`, `banned_ips`, `sponsors`, `business_directory`, `ground_handling_sites`, `page_attachments`, `competitions`, `pilots`, `pilot_sessions`, `flights`, `breadcrumbs`, `retrievals`, `map_messages`, `safety_sections`, `search_logs`, `tidyhq_group_mappings`, `tidyhq_webhook_log`, `schema_migrations`, `pilot_sessions`

### Key observations
- Old `server/migrations/` folder (53 files) is **deprecated** — `getMigrationsDir()` in `db.ts` explicitly returns `pg_migrations/`. The old folder is no longer used by the migration runner.
- `admin_sessions.userId`: old SQLite migration had `INTEGER`, pg_migrations has `TEXT`. Since the old migrations are unused, no conflict.
- `checkins.id`: old SQLite migration had `INTEGER PRIMARY KEY AUTOINCREMENT`, pg_migrations has `TEXT PRIMARY KEY`. Application code uses string IDs (`"FL-0001"`). Consistent.

### Verdict
**Schema is in sync.** The unified migration path eliminates drift risk. No schema drift findings.

---

## Finding DB-C2-001: `DATE()` function in checkins.ts has no pgDb converter
- **Severity:** CRITICAL
- **Type:** SQLite Syntax
- **File(s):** `server/routes/checkins.ts`, line 27
- **Lines:** `checkins.ts:27`
- **Code:**
  ```typescript
  const today = await db.prepare("SELECT COUNT(*) as count FROM checkins WHERE DATE(timestamp) = DATE('now')").get() as { count: number };
  ```
- **SQLite Behavior:** `DATE('now')` returns today's date as a string `YYYY-MM-DD`. `DATE(timestamp)` extracts the date portion of a datetime string. The comparison correctly returns today's checkin count.
- **PostgreSQL Behavior:** PostgreSQL has no `DATE(string)` function. `DATE` is a type name, not a function. PostgreSQL will throw an error: `function date(unknown) does not exist`. The query fails at runtime.
- **Impact:** `GET /api/admin/checkins/stats` endpoint returns 500 in production. Daily checkin counts (total and today's) are unavailable.
- **Confidence:** HIGH
- **Recommended fix:** Replace with: `SUBSTR(timestamp, 1, 10) = SUBSTR(DATE('now'), 1, 10)` or a 24-hour window: `timestamp >= datetime('now', '-24 hours')`

## Finding DB-C2-002: Mixed placeholder styles (positional + named) would silently break in PostgreSQL
- **Severity:** MEDIUM
- **Type:** Parameter Syntax / Adapter Gap
- **File(s):** `server/pgDb.ts`, lines 39-58
- **Lines:** `pgDb.ts:39-58`
- **Code:**
  ```typescript
  function toPostgresParams(sql: string, params: any[]): { sql: string; values: any[] } {
    if (params.length === 1 && typeof params[0] === "object" && !Array.isArray(params[0]) && params[0] !== null) {
      // Named params branch — converts @key → $1, $2, ... but does NOT touch ?
      const obj = params[0];
      const values: any[] = [];
      let i = 1;
      const converted = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key) => {
        values.push(obj[key] ?? null);
        return `$${i++}`;
      });
      return { sql: converted, values };
    }
    // Positional params branch — converts ? → $1, $2, ... but does NOT touch @key
    let i = 0;
    const converted = sql.replace(/\?/g, () => `$${++i}`);
    return { sql: converted, values: params };
  }
  ```
- **SQLite Behavior:** better-sqlite3 supports both `?` and `@param` in the same query, and object params are flattened into arrays. Mixed styles work.
- **PostgreSQL Behavior:** The named-params branch (object input) converts `@key` → `$N` but leaves `?` as literal `?` characters. PostgreSQL rejects `?` as a syntax error (only `$N` is valid). The positional branch converts `?` → `$N` but leaves `@key` as a literal `@key` — also invalid PostgreSQL. If a future query mixes both placeholder styles, production crashes.
- **Impact:** No current queries mix `?` and `@param` in the same statement. However, the adapter provides no defense against this mistake. A developer could accidentally write a query using both styles and it would work in dev (SQLite) but fail in production (PostgreSQL).
- **Confidence:** HIGH
- **Recommended fix:** Add a check that throws a clear error if both `?` and `@word` patterns are detected in the same SQL string.

## Finding DB-C2-003: INSERT OR REPLACE fallback on unknown tables causes silent data loss
- **Severity:** MEDIUM
- **Type:** Adapter Gap
- **File(s):** `server/pgDb.ts`, lines 136–140
- **Lines:** `pgDb.ts:136-140`
- **Code:**
  ```typescript
  } else {
    log.warn(
      `INSERT OR REPLACE for unknown table has no explicit handler — falling back to ON CONFLICT DO NOTHING. ` +
      `New tables using INSERT OR REPLACE must be added to convertSQL() in pgDb.ts.`
    );
    sql = sql.trimEnd().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
  }
  ```
- **SQLite Behavior:** `INSERT OR REPLACE` deletes the conflicting row and inserts the new one — all columns from VALUES are written. This is the "upsert" (replace) semantic.
- **PostgreSQL Behavior:** `ON CONFLICT DO NOTHING` skips the insert entirely when a conflict exists. New data is NOT written. This is fundamentally different from REPLACE — it's a no-op on conflict. If a developer adds `INSERT OR REPLACE` for a new table and forgets to add its handler in `pgDb.ts`, production will silently skip updates instead of replacing them. The query succeeds (no error), but the data is wrong.
- **Impact:** Zero for current tables (all have handlers). But latent for any future `INSERT OR REPLACE` without its corresponding handler. The `log.warn` only fires if the server starts with DATABASE_URL set — it may go unnoticed in production if the migration is already deployed.
- **Confidence:** HIGH
- **Recommended fix:** Either: (1) throw an error instead of falling back to `ON CONFLICT DO NOTHING`, forcing the developer to add a handler; or (2) add a CI check that validates all `INSERT OR REPLACE` calls have a corresponding handler.

## Finding DB-C2-004: DO $$ anonymous blocks silently stripped during SQLite migration with no logging
- **Severity:** LOW
- **Type:** Adapter Gap
- **File(s):** `server/db.ts`, line 71; `server/pg_migrations/012_fix_extended_wind_grids_columns.sql`; `server/pg_migrations/022_fix_closure_pills_max_column_case.sql`
- **Lines:** `db.ts:71`
- **Code:**
  ```typescript
  // db.ts:71
  result = result.replace(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi, "");
  ```
- **SQLite Behavior:** `DO $$ ... $$` anonymous blocks are a PostgreSQL-only PL/pgSQL construct — SQLite has no equivalent. The entire block is stripped. The current migration files that use these blocks (`012` and `022`) contain PostgreSQL-specific logic (conditional column renames via `information_schema`) that are irrelevant for SQLite — so the strip is harmless today.
- **PostgreSQL Behavior:** These blocks execute correctly in PostgreSQL. The conditional logic (`IF EXISTS ... THEN RENAME ...`) prevents errors if the column is already correctly named.
- **Impact:** Low — no current harm. But if a future migration puts SQLite-relevant logic inside a `DO $$` block, it would be silently dropped with no warning.
- **Confidence:** HIGH
- **Recommended fix:** Add a `log.debug()` line when a `DO $$` block is stripped, so developers are aware during SQLite development.

---

## Anti-Hallucination Checklist

| # | Finding | Read actual code? | Demonstrated both DB behaviors? | Verified adapter handling? | Evidence quality |
|---|---------|-------------------|-----------------------------|--------------------------|-----------------|
| 1 | DB-C2-001 (DATE function) | ✅ read checkins.ts:27 | ✅ SQLite DATE() works, PG has no such function | ✅ checked pgDb.ts converters — DATE() not listed | HIGH |
| 2 | DB-C2-002 (mixed placeholders) | ✅ read pgDb.ts:39-58 | ✅ named branch leaves ?, positional branch leaves @key | ✅ verified no current queries mix both | HIGH |
| 3 | DB-C2-003 (OR REPLACE fallback) | ✅ read pgDb.ts:136-140 | ✅ REPLACE≠DO NOTHING semantics differ | ✅ confirmed all current tables have handlers | HIGH |
| 4 | DB-C2-004 (DO $$ stripped) | ✅ read db.ts:71 | ✅ PostgreSQL-only syntax, silently deleted for SQLite | ✅ confirmed current migrations are PG-specific repair logic | HIGH |

All findings pass the anti-hallucination checklist.

## Notes on Patterns That Were Investigated But Found Clean

The following categories were thoroughly investigated but no active bugs were found (the adapter handles them correctly):

- **`datetime('now', ...)` expressions:** All variants found in routes and services (`datetime('now')`, `datetime('now', '-24 hours')`, `datetime('now', '-10 hours')`, `datetime('now', '-7 days')`, `datetime('now', '-10 hours', 'start of day')`) are matched and converted by the five regex patterns in `pgDb.ts:171-176`. No SQLite-only datetime expressions remain unhandled.

- **`INSERT OR REPLACE` / `INSERT OR IGNORE`:** All calls in the codebase (across routes, services, utils, and seed.ts) have explicit handlers in `pgDb.ts:convertSQL()`. The handler list covers: `settings`, `sites`, `wind_grid_data`, `site_extended_forecasts`, `extended_forecasts`, `weather_forecasts`, `document_index`, `emergency_hospitals_cache`, `contacts`, and a `ON CONFLICT DO NOTHING` fallback. The fallback on unknown tables is flagged as DB-C2-003.

- **`ON CONFLICT ... DO UPDATE SET ...`:** Used directly in several queries (e.g., settings upserts, pageviews). SQLite supports this syntax natively (since v3.38.0), and PostgreSQL supports it natively. The pgDb adapter's `quoteIdentifiersIfNeeded` does not interfere with this syntax. No incompatibility.

- **`CURRENT_TIMESTAMP`:** Standard SQL, works identically in both databases. Used extensively across routes where timestamps are needed. No issue.

- **Schema drift:** Resolved by the unified migration strategy. The old `server/migrations/` folder is no longer active. All schema changes come from `server/pg_migrations/`.
