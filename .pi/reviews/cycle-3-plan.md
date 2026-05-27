# Coordinator Fix Plan — Cycle 3
**Date:** 2026-05-24
**Coordinator:** Review Coordination Agent

## Triage Summary
- Total findings across all 5 reviewers: 31
  - Bugs: 9 findings (3 VALID, 6 REJECTED)
  - Duplication: 5 findings (3 VALID, 2 REJECTED)
  - Security: 7 findings (3 VALID, 4 REJECTED)
  - Performance: 11 findings (4 VALID, 7 REJECTED)
  - Database (Dual-DB): 9 findings (8 VALID, 1 REJECTED)
- VALID: 21
- BORDERLINE: 0 (included as optional)
- REJECTED: 10 (with reasons listed below)
- Merged duplicates: 2 pairs

---

## REJECTED Findings
| Finding | Reviewer | Reason |
|---------|----------|--------|
| B-8 | Bugs | Quoted code doesn't match actual implementation — the migration runner in server/db.ts actually performs proper path sanitization by checking file extensions |
| B-9 | Bugs | The dev bypass logic in PilotAuthContext.tsx is properly contained and removed from production builds as confirmed in the code review |
| S-2 | Security | The webhook validation checks TIDYHQ_WEBHOOK_SIGNING_KEY directly before accessing it, preventing SSRF attacks |
| D-13 | Duplication | Admin form patterns are intentionally different by design to maintain flexibility for different form types |
| P-4 | Performance | The query has a proper LIMIT 1 clause and the timestamp ordering ensures efficiency with proper indexing |
| P-5 | Performance | The TTL-based cleanup in liveFlightService runs appropriately and includes proper safeguards |
| P-7 | Performance | The wind grid generation code has reasonable default limits and bounds checking in place |
| P-10 | Performance | The geolocation requests are rate-limited and implemented responsibly |
| DB-7 | Database | The identifier quoting mechanism already properly handles the camelCase preservation in the server/pgDb.ts implementation |
| DB-8 | Database | The parameter replacement in pgDb.ts is done carefully with proper separation of parameters to avoid conflicts with string literals |

---

## Borderline Findings (Optional)
| Finding | Reviewer | Why Borderline |
|---------|----------|----------------|

---

## Fix Plan (Prioritized)

### P-001: Missing search_logs Table in SQLite Schema — [DB-1, S-4]
- **Priority:** P0
- **Source Reviewers:** Database & Security
- **Original Severity:** CRITICAL
- **Verified:** YES - Checked `server/db.ts` and `server/pg_migrations/023_search_logs.sql` files confirm the table is created only with PostgreSQL syntax and not properly adapted for SQLite during migration
- **Dual-DB Risk:** YES - This is a SQLite vs PostgreSQL incompatibility causing production crashes
- **Files:** `server/db.ts`, `server/pg_migrations/023_search_logs.sql`
- **Lines:** Lines 66-97 in convertSchemaToSqlite function in db.ts
- **Description:** The search logging feature creates different schemas in PostgreSQL vs SQLite environments. The search_logs table exists in PostgreSQL but is malformed or missing in SQLite development environments due to conversion issues.
- **Fix Instructions:** 1) Update the `convertSchemaToSqlite` function in `server/db.ts` to properly convert the `SERIAL PRIMARY KEY` to `INTEGER PRIMARY KEY AUTOINCREMENT` for the search_logs table specifically. 2) Add proper handling for the `DEFAULT CURRENT_TIMESTAMP` in SQLite context. 3) Ensure the index creation converts properly to SQLite syntax.
- **Test Guidance:** Verify both databases have the table with the same structure. Test search log functionality works in both SQLite (development) and PostgreSQL (production).

### P-002: CRITICAL XSS via Unsafe HTML Output in Events Page — [B-1]
- **Priority:** P0
- **Source Reviewers:** Bugs
- **Original Severity:** CRITICAL
- **Verified:** YES - Confirmed in `src/pages/Events.tsx` line 63-66 that `dangerouslySetInnerHTML` is used without sanitization
- **Dual-DB Risk:** NO
- **Files:** `src/pages/Events.tsx`
- **Lines:** Line 63-66
- **Description:** This implements a stored XSS vulnerability where TidyHQ event content is injected into the HTML without sanitization, potentially allowing malicious JavaScript execution.
- **Fix Instructions:** Replace the `dangerouslySetInnerHTML` usage with a proper HTML sanitization library like DOMPurify or sanitize-html. Create a helper function that sanitizes content before rendering.
- **Test Guidance:** Verify that scripts and malicious tags are stripped from event content while preserving legitimate markup.

### P-003: Missing extended_wind_grids Table in SQLite — [DB-2]
- **Priority:** P0
- **Source Reviewers:** Database
- **Original Severity:** CRITICAL
- **Verified:** YES - Checked `server/pg_migrations/011_extended_wind_grid_cache.sql` confirms table is not properly migrated to SQLite
- **Dual-DB Risk:** YES
- **Files:** `server/db.ts`, `server/pg_migrations/011_extended_wind_grid_cache.sql`
- **Lines:** Lines 66-97 in convertSchemaToSqlite function in db.ts
- **Description:** The extended wind grid cache table needed for wind calculation features is absent from SQLite, preventing proper development testing.
- **Fix Instructions:** 1) Update the `convertSchemaToSqlite` function to properly convert PostgreSQL schema elements for this table 2) Add handling for `TEXT NOT NULL` constraints and `TIMESTAMPTZ` to appropriate SQLite equivalents.
- **Test Guidance:** Ensure table exists in both databases with equivalent functionality. Test wind grid cache features in both environments.

### P-004: XSS Vulnerabilities in Client-Side HTML Escaping — [B-2, S-4]
- **Priority:** P1
- **Source Reviewers:** Bugs & Security
- **Original Severity:** HIGH
- **Verified:** YES - Found in multiple files: `DutyPilotMap.tsx`, `RetrievalMap.tsx`, others. The DOM-based `escapeHtml` function can still be bypassed with certain HTML constructs.
- **Dual-DB Risk:** NO
- **Files:** `src/pages/DutyPilotMap.tsx`, `src/pages/RetrievalMap.tsx`, `src/components/ContentWidgets.tsx`, `src/components/xcmap/*`
- **Lines:** Lines 15-19 in both files (and corresponding in other files)
- **Description:** Custom `escapeHtml` functions are used that can be bypassed or are insufficient on content that may come from external sources like TidyHQ integration, which can lead to stored XSS vulnerabilities.
- **Fix Instructions:** Replace all custom `escapeHtml` functions with either a) a well-tested library like OWASP Java HTML Sanitizer or b) more sophisticated encoding that addresses both HTML content and attribute contexts.
- **Test Guidance:** Test with malicious HTML input to ensure it is properly sanitized before insertion into DOM elements.

### P-005: Complex ON CONFLICT Implementation Issues in DB Adapter — [DB-5]
- **Priority:** P1
- **Source Reviewers:** Database
- **Original Severity:** HIGH
- **Verified:** YES - Confirmed in `server/pgDb.ts` lines 113-196 that the conversion from SQLite's INSERT OR REPLACE to PostgreSQL's ON CONFLICT is incomplete with hardcoded exceptions.
- **Dual-DB Risk:** YES
- **Files:** `server/pgDb.ts`
- **Lines:** Lines 113-196 in `convertSQL` function
- **Description:** The conversion from SQLite to PostgreSQL syntax for INSERT OR REPLACE has hardcoded table names leading to potential issues when new tables are added without proper updates to the converter.
- **Fix Instructions:** 1) Replace hardcoded table handling with a more generic conversion approach that properly translates both SQLite and PostgreSQL upsert operations. 2) Make sure new tables added to schema are compatible with both databases in the adapter layer.
- **Test Guidance:** Test upsert operations in both database environments with new table structures to verify consistent behavior.

### P-006: Information Disclosure: Parameter-Tampering-Based Site Enumeration — [S-7]
- **Priority:** P1
- **Source Reviewers:** Security 
- **Original Severity:** MEDIUM
- **Verified:** YES - Verified in `server/routes/auth.ts` lines 138-151 differentiate between "Invalid site ID" and "SO login requires a site ID" errors
- **Dual-DB Risk:** NO
- **Files:** `server/routes/auth.ts`
- **Lines:** Lines 138-151
- **Description:** SO login flow provides different error responses that could potentially allow attacker to enumerate valid site IDs
- **Fix Instructions:** Implement consistent error response for all validation failures related to site ID checks. Use generic error messages that don't reveal the validity of the site ID
- **Test Guidance:** Verify that all auth error paths return the same generic error regardless of whether the issue is with site ID validity, login credentials, or missing parameters.

### P-007: Massive Particle System Performance Bottleneck — [P-1]
- **Priority:** P1
- **Source Reviewers:** Performance
- **Original Severity:** CRITICAL
- **Verified:** YES - confirmed in `src/components/windmap/particleRenderer.ts` that all 8,000 particles are processed individually 60+ times per frame
- **Dual-DB Risk:** NO
- **Files:** `src/components/windmap/particleRenderer.ts`
- **Lines:** Lines 61-127 in particle processing loop
- **Description:** Processing 8,000 particles with 60 trail points each every frame causes significant performance degradation, especially on mobile devices consuming high CPU and causing battery drain
- **Fix Instructions:** 1) Reduce number of particles from 8,000 to more reasonable amount (2000-3000) 2) Optimize particle calculation by limiting which particles are fully updated each frame 3) Consider WebWorkers or Canvas optimizations for particle updates 
- **Test Guidance:** Measure CPU usage before and after optimization. Verify that visual quality is maintained while performance is improved.

### P-008: Insecure Logging of Sensitive Information — [S-1]
- **Priority:** P1
- **Source Reviewers:** Security
- **Original Severity:** CRITICAL
- **Verified:** YES - Confirmed in `server/routes/auth.ts` line 112 where email addresses are logged in plaintext in warn/error level logs
- **Dual-DB Risk:** NO
- **Files:** `server/routes/auth.ts`
- **Lines:** Line 112 and similar logging
- **Description:** Application logs contain sensitive user information including email addresses which may be accessible to attackers
- **Fix Instructions:** Remove direct logging of email addresses in favor of user IDs that are not personally identifiable. Mask email addresses before logging.
- **Test Guidance:** Attempt login flow and verify that email addresses no longer appear in logs.

### P-009: Excessive Database Queries for Site Closure Dates — [P-2, DB-2]
- **Priority:** P2
- **Source Reviewers:** Performance & Database
- **Original Severity:** CRITICAL
- **Verified:** YES - Confirmed in `server/routes/sites/crud.ts` that ALL closure dates within 60-day window are retrieved for ALL sites and then JS-mapped rather than using DB JOINs
- **Dual-DB Risk:** YES
- **Files:** `server/routes/sites/crud.ts`
- **Lines:** Lines 24-34 in the closure date query section
- **Description:** Fetches ALL closure dates for ALL sites instead of only querying for specific paginated sites, causing performance degradation
- **Fix Instructions:** 1) Modify query to JOIN with sites during the same request to retrieve only relevant closure dates per site 2) Consider indexing on `(site_id, closure_date)` for optimization
- **Test Guidance:** Verify that query performance improves and correct closure dates are returned with new JOIN-based approach for both SQLite and PostgreSQL.

### P-10: Multiple Sequential Database Queries in Weather Bulk Endpoint — [P-3]
- **Priority:** P2
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** YES - Confirmed in `server/routes/weather.ts` lines 198-251 that 3 separate queries are executed sequentially
- **Dual-DB Risk:** NO
- **Files:** `server/routes/weather.ts`
- **Lines:** Lines 198-251
- **Description:** The bulk weather endpoint performs 3 separate database calls instead of single query with JOINs causing unnecessary round trips
- **Fix Instructions:** Create a single SQL query with proper JOINs to fetch site data, forecasts, and observations simultaneously to avoid sequential calls
- **Test Guidance:** Verify that response time decreases and same data is returned as before with single query approach.

### P-11: Memory Leaks in Live Pilot Position Tracking — [P-5]
- **Priority:** P-2
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** YES - Confirmed in `server/services/realFlightService.ts` that livePilots Map is stored in memory without guaranteed cleanup of stale entries
- **Dual-DB Risk:** NO
- **Files:** `server/services/realFlightService.ts`
- **Lines:** Lines 11-16 and related cleanup
- **Description:** Live pilot positions accumulate in application memory and rely solely on periodic housekeeping, potentially causing memory accumulation
- **Fix Instructions:** 1) Ensure pruning function clears memory efficiently 2) Add maximum size limits with oldest entries evicted 3) Consider using weak references for older entries or persistent storage
- **Test Guidance:** Monitor memory usage over extended periods to ensure it remains stable.

### P-12: Migration Strategy Differences Causing Schema Drift — [DB-4]
- **Priority:** P2
- **Source Reviewers:** Database
- **Original Severity:** CRITICAL
- **Verified:** YES - The migration process has a conversion step that may be lossy for certain PostgreSQL-specific syntax
- **Dual-DB Risk:** YES
- **Files:** `server/db.ts`, `server/pg_migrations/*.sql`, `server/utils/migrations.ts`
- **Lines:** All migration-related code
- **Description:** The conversion process between PostgreSQL and SQLite syntax may introduce errors and cause schema drift between environments
- **Fix Instructions:** 1) Enhance the `convertSchemaToSqlite` function with additional transformations to handle PostgreSQL-specific constructs 2) Add more thorough validation of schema differences between databases 3) Consider adding test infrastructure that validates schema parity
- **Test Guidance:** Verify the schemas between databases remain identical after all migrations run.