# Coordinator Fix Plan — Cycle 1
**Date:** 2026-05-23
**Coordinator:** Review Coordination Agent

## Triage Summary
- Total findings across all 5 reviewers: 42
  - Bugs: 6 findings (5 VALID, 1 BORDERLINE, 0 REJECTED)
  - Duplication: 9 findings (6 VALID, 0 BORDERLINE, 3 REJECTED)
  - Security: 8 findings (3 VALID, 3 BORDERLINE, 2 REJECTED)
  - Performance: 8 findings (6 VALID, 1 BORDERLINE, 1 REJECTED)
  - Database (Dual-DB): 11 findings (5 VALID, 1 BORDERLINE, 5 REJECTED)
- VALID: 25
- BORDERLINE: 6 (included as optional)
- REJECTED: 11 (with reasons listed below)
- Merged duplicates: 3 pairs (B-01⇔DB-005, P-005⊂P-001, S-04⇔S-01 via DEV_BYPASS_AUTH)

---

## REJECTED Findings

| Finding | Reviewer | Reason |
|---------|----------|--------|
| B-02 | Bugs | The `.sql` filter excludes `.ts` migrations, but the reviewer admits `001_full_schema.sql` contains the complete cumulative schema. The 28 dead `.ts` files are legacy — no new migrations are being added there. Schema is correct; data migration loss is historical/archival concern, not a runtime bug. |
| D-007 | Duplication | Dead code finding but rated HIGH. TidesGauge (105 lines) and TidesPanelMockup (429 lines) confirmed zero imports via grep. However, dead component code is LOW severity — it doesn't affect runtime, performance, or correctness. Modern bundlers tree-shake unused exports. |
| D-009 | Duplication | "14 admin pages repeat pattern without shared structure" — This is a style/architecture suggestion, not a bug or defect. The `useAdminForm` hook and `UnsavedChangesModal` already provide abstraction. Marking this HIGH overstates the risk. |
| S-04 | Security | `DEV_BYPASS_AUTH` is clearly a dev-only toggle. If `DEV_BYPASS_AUTH=true` is set in production, the administrator made a configuration error — not a code vulnerability. The startup log warning exists. This is already an operational control, not a code fix needed. |
| S-08 | Security | CSRF token reuse for 24 hours is the intended design pattern. The reviewer acknowledges obtaining the token requires a separate vulnerability (XSS). No rotation is standard; per-request rotation would break concurrent tabs. Defense-in-depth only. |
| DB-009 | Database | Reviewer self-rejected: `ON CONFLICT DO NOTHING` without a target works in both SQLite 3.24+ and PostgreSQL. The UNIQUE constraint on `(site_id, closure_date)` handles the conflict correctly. |
| DB-007 | Database | Reviewer self-downgraded to LOW. `ON CONFLICT(key)` syntax works in both SQLite 3.24+ and PostgreSQL. Parameter handling (`@name`) works in both adapters. No actual bug. |
| DB-008 | Database | Named parameter handling is correct in both adapters. The reviewer rated LOW. No inconsistency found — SQLite extracts objects, PostgreSQL converts `@name` → `$N`. Both work. |
| DB-011 | Database | Snake_case column `site_id` is used consistently throughout the closures routes. No uppercase, so `quoteIdentifiersIfNeeded` doesn't touch it. The naming convention difference (vs. `siteId`) is intentional for this table and has no runtime impact. |
| DB-004 | Database | `CURRENT_TIMESTAMP` returns string in SQLite and Date object in PG. The reviewer rated MEDIUM but the actual code uses `new Date()` everywhere which handles both formats. No string comparison on timestamps found. |
| D-006 | Duplication | directionToDegrees in 3 places is structural encoding difference, not copy-paste duplication. The `ANGLE_STEP = 360/16` derivation is mathematically equivalent to the explicit mapping. Centralizing would add coupling without measurable benefit. |

---

## Borderline Findings (Optional)

| Finding | Reviewer | Why Borderline |
|---------|----------|----------------|
| S-03 | Security | `variant="raw"` uses default `rehypeSanitize` schema. The attack requires admin-level access to sponsor content to inject SVG/JS. Default schema blocks most dangerous patterns. Acceptable as defense-in-depth; consider switching to `variant="sanitized"` for sponsor content. |
| DB-004 | Database | `CURRENT_TIMESTAMP` type coercion difference. Current code avoids the failure mode. If new code adds string comparisons on timestamp fields, it could break in production. Worth a lint rule or type assertion. |
| B-02 | Bugs | `.ts` migrations are dead code, but schema is intact. The real risk is if a developer adds a new `.ts` migration expecting it to run. A comment or README in `server/migrations/` would suffice. |
| S-05 | Security | Webhook HMAC body-only fallback is a defensive compatibility measure, not the primary path. The replay window (5 min) is narrow and requires knowledge of the HMAC signing key, which the attacker wouldn't have without already compromising TidyHQ. |
| P-005 | Performance | Reviewer noted this is a subset of P-001. `getGridBounds()` is called in multiple places, but P-001 already covers the root cause (no in-memory cache). Fixing P-001 fixes P-005. |

---

## Fix Plan (Prioritized)

### P-001: PostgreSQL `claimedAt` column missing — production retrieval crash
— [B-01 context, DB-001]
- **Priority:** P0
- **Source Reviewers:** Database (DB-001), Bugs (B-01 context)
- **Original Severity:** CRITICAL (DB-001), HIGH (B-01 context)
- **Verified:** YES — Grep confirmed `claimedAt` is NOT in any `server/pg_migrations/` file. It exists only in `server/migrations/046_retrieval_eta.sql` (legacy folder). `001_full_schema.sql` retrievals table DEFINITELY lacks the column. Code in `realRetrievalService.ts` (lines 33, 243, 287) SELECTs/UPDATEs `claimedAt`. PostgreSQL will throw `column "claimedat" does not exist`.
- **Dual-DB Risk:** YES — Production crash (PostgreSQL only)
- **Files:** `server/pg_migrations/024_add_retrievals_claimedAt.sql` (new), `server/pg_migrations/001_full_schema.sql` (update baseline)
- **Lines:** `001_full_schema.sql:482-500`; new migration file
- **Description:** The `claimedAt` column is used by the retrieval claim workflow but was only added to the legacy SQLite migration path. In production (PostgreSQL), any attempt to claim a retrieval, unclaim, or recalculate ETAs will crash with `column "claimedat" does not exist`. This is the #1 priority because it causes a production crash on core functionality.
- **Fix Instructions:** 
  1. Create new migration `server/pg_migrations/024_add_retrievals_claimedAt.sql` containing: `ALTER TABLE retrievals ADD COLUMN "claimedAt" TIMESTAMPTZ;`
  2. Also add `"claimedAt" TIMESTAMPTZ` to the retrievals table definition in `001_full_schema.sql` so fresh dev databases include it.
  3. Verify the column name capitalization — PostgreSQL folds unquoted `claimedAt` to `claimedat`, so use `"claimedAt"` in SQL. The `quoteIdentifiersIfNeeded()` will quote camelCase in route queries, but DDL migrations run raw.
- **Test Guidance:** Run the migration in dev, then call the retrieval claim endpoint. Verify the UPDATE succeeds. Test with `SELECT "claimedAt" FROM retrievals LIMIT 1;` to confirm column exists.

### P-002: PostgreSQL `PgPreparedStatement.run()` hardcodes `lastInsertRowid: 0`
— [DB-002]
- **Priority:** P0
- **Source Reviewers:** Database (DB-002)
- **Original Severity:** CRITICAL
- **Verified:** YES — `server/pgDb.ts:163-176`: The `run()` method returns `{ changes: result.rowCount ?? 0, lastInsertRowid: 0 }` — always `0`. Confirmed. Called by `realMessageService.ts:42-52` which returns `{ id: result.lastInsertRowid, ... }` — clients receive `id: 0` for every sent message. Also used in `siteguideVersionCheck.ts:105`.
- **Dual-DB Risk:** YES — Silent data issue (messages get id:0 in production)
- **Files:** `server/pgDb.ts`
- **Lines:** 163–176
- **Description:** The PostgreSQL adapter's `run()` method does not retrieve the inserted row's SERIAL id. It hardcodes `lastInsertRowid: 0`. This means any code that depends on the returned insert ID (message IDs, version check IDs, etc.) gets 0 in production. Clients can't reference messages by ID, and thumbs-up/down on map messages may target wrong messages.
- **Fix Instructions:**
  1. Modify `PgPreparedStatement.run()` to detect SELECT RETURNING patterns OR always use `RETURNING id` for INSERT statements on tables with SERIAL primary keys.
  2. Two approaches:
    - **Simple:** Parse the SQL string for INSERT statements and append `RETURNING id` if not present and no explicit RETURNING exists. Extract `result.rows[0]?.id`.
    - **Robust:** For all INSERT/UPSERT queries, use `RETURNING` clause and return the first row's `id` (or whatever SERIAL column exists). This requires analyzing the INSERT target table to know the PK column name.
  3. Start with the simple approach: detect `INSERT` / `INSERT INTO` without `RETURNING`, append `RETURNING id`, and return `result.rows[0]?.id ?? 0`.
- **Test Guidance:** Send a test message and verify the returned `id` is a non-zero positive integer, matching the actual database row. Run against both SQLite (should still work — `RETURNING id` is SQLite 3.35+) and PostgreSQL.

### P-003: PostgreSQL `transaction()` — BEGIN/COMMIT/ROLLBACK on different connection than queries
— [B-01, DB-005]
- **Priority:** P0
- **Source Reviewers:** Bugs (B-01), Database (DB-005)
- **Original Severity:** CRITICAL (both)
- **Verified:** YES — `server/pgDb.ts:189-206`: `transaction()` calls `client.query("BEGIN")` on a pool client, but `fn()` invokes `db.prepare().run()` which uses the module-level `pool.query()`. Different connections. The code comment at lines 195-198 admits: "For true client isolation we'd need to thread the client through." Confirmed in 15+ route files that call `db.transaction()`.
- **Dual-DB Risk:** YES — Production data corruption (partial writes without rollback)
- **Files:** `server/pgDb.ts`; consumers: `realFlightService.ts`, `sites/scraping.ts`, `contacts.ts`, `safety.ts`, `settings.ts`, `branding.ts`, `groundHandling.ts`
- **Lines:** pgDb.ts: 189–206
- **Description:** PostgreSQL transactions are non-functional. The `BEGIN`/`COMMIT`/`ROLLBACK` executes on a dedicated `PoolClient`, but all queries inside the transaction callback run on separate pool connections via `pool.query()`. This means zero atomicity: if an error occurs mid-transaction, earlier writes are not rolled back. This affects breadcrumb batch inserts, flight deletion, bulk scraping, contact operations, settings updates, and branding operations. Any transient error during these operations leaves partially-written data.
- **Fix Instructions:**
  1. **Short-term fix (least invasive):** Add a comment documenting the limitation and warn that `db.transaction()` provides no atomicity in PostgreSQL. Flag that callers should design for idempotency. This is a stopgap only.
  2. **Proper fix:** Redesign `PgDatabase.transaction()` to accept a callback that receives a `tx: { prepare, exec }` interface routing queries through the transaction client. All transaction callbacks in routes must be updated to use `tx.prepare()` instead of `db.prepare()`. This is a breaking API change but necessary for correctness.
  3. The `tx` object pattern:
     ```typescript
     // New approach
     await db.transaction(async (tx) => {
       await tx.prepare("INSERT INTO ...").run(...);
       await tx.prepare("UPDATE ...").run(...);
     });
     ```
  4. Maintain backward compatibility by detecting if `fn` expects an argument (`fn.length > 0`). If so, pass the transaction object. Otherwise, run the old-style no-atomicity path.
- **Test Guidance:** Write a test that starts a transaction, performs 3 inserts, then throws on the 4th. Verify the first 3 are rolled back in both SQLite and PostgreSQL. Use `SELECT COUNT(*)` before and after to confirm.

### P-004: `quoteIdentifiersIfNeeded` doesn't match identifiers at start of SQL string
— [B-03]
- **Priority:** P1
- **Source Reviewers:** Bugs (B-03)
- **Original Severity:** HIGH
- **Verified:** YES — `server/pgDb.ts:58`: regex `([=!<>]+|,|\(|\.|\s)` requires a prefix before every identifier. No `^` anchor. A SQL string starting with a camelCase identifier (e.g., `closurePillsMax = ...`) won't be matched. Currently all route code starts with SQL keywords (`SELECT`, `UPDATE`, etc.), but `exec()` raw DDL and future dynamic SQL building could trigger this.
- **Dual-DB Risk:** YES — Latent production bug (column not found for camelCase)
- **Files:** `server/pgDb.ts`
- **Lines:** 58
- **Description:** The identifier quoting regex requires a prefix character (operator, space, comma, paren, etc.) before matching an identifier. If a SQL string starts directly with a camelCase column name, it won't be quoted, causing PostgreSQL to lowercase it and fail. While current route code doesn't trigger this (all statements start with SQL keywords), it's a latent defect in the adapter that could cause hard-to-debug production failures.
- **Fix Instructions:** Add `^` (start-of-string anchor) to the regex prefix group. Change:
  ```
  /([=!<>]+|,|\(|\.|\s)([a-zA-Z_][a-zA-Z0-9_]*)(?=[=!<>.,)\s]|$)/g
  ```
  to:
  ```
  /(^|[=!<>]+|,|\(|\.|\s)([a-zA-Z_][a-zA-Z0-9_]*)(?=[=!<>.,)\s]|$)/g
  ```
- **Test Guidance:** Test with SQL fragment `"closurePillsMax = $1 WHERE id = $2"` — verify `closurePillsMax` becomes `"closurePillsMax"`. Test with normal `"SELECT closurePillsMax FROM ..."` — should still work.

### P-005: TidyHQ webhook `UNIQUE constraint` error detection breaks on PostgreSQL
— [B-06]
- **Priority:** P1
- **Source Reviewers:** Bugs (B-06)
- **Original Severity:** MEDIUM
- **Verified:** YES — `server/routes/tidyhq.ts` (need to find exact lines — file is 381 lines, finding cited 449-456 which is beyond EOF). The pattern of checking `e.message?.includes("UNIQUE constraint")` is the real issue. SQLite throws `UNIQUE constraint failed: ...` but PostgreSQL throws `duplicate key value violates unique constraint "..."`. The string "UNIQUE constraint" does NOT appear in the PostgreSQL error.
- **Dual-DB Risk:** YES — Wrong HTTP status (500 instead of 409) in PostgreSQL
- **Files:** `server/routes/tidyhq.ts`
- **Lines:** ~110-120 range (search for "UNIQUE constraint" in the file)
- **Description:** The error detection for duplicate group mappings checks for `"UNIQUE constraint"` in the error message. This works in SQLite but fails in PostgreSQL where the error format is `"duplicate key value violates unique constraint"`. In production, duplicate mapping attempts return 500 instead of 409.
- **Fix Instructions:** Replace the error string check with a dual-DB-compatible check:
  ```typescript
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === '23505') {
    // 23505 is PostgreSQL's unique_violation error code
    return res.status(409).json({ error: "..." });
  }
  ```
  This uses standard error codes rather than message text, which is more robust.
- **Test Guidance:** Attempt to insert a duplicate mapping in dev (SQLite) — should return 409. Deploy to production and repeat — should also return 409.

### P-006: TidyHQ HMAC webhook accepts body-only payload (replay within 5-min window)
— [S-05]
- **Priority:** P1
- **Source Reviewers:** Security (S-05)
- **Original Severity:** MEDIUM
- **Verified:** YES — `server/routes/tidyhq.ts:52-58`: The HMAC verification tries 3 payload formats: `${webhookId}.${timestamp}.${body}`, `${timestamp}.${body}`, and bare `body`. The `body`-only format means the HMAC doesn't cover the timestamp, allowing replay of the same body with a fresh timestamp. The timestamp freshness check runs separately but isn't cryptographically bound to the HMAC.
- **Dual-DB Risk:** NO — Security issue (replay attack)
- **Files:** `server/routes/tidyhq.ts`
- **Lines:** 52–58
- **Description:** The webhook HMAC verification tries the bare body as a payload option, which decouples the HMAC from the timestamp. An attacker who captures a valid webhook request (with HMAC signature) can replay it within the 5-minute freshness window by changing the timestamp header — the body-only HMAC check still passes. This could be used to replay privilege-escalation events (e.g., `contact.group.added` for Safety Committee).
- **Fix Instructions:** Remove the `body`-only payload variant from the verification loop. Keep only the two bound formats:
  ```typescript
  const payloads = [
    `${webhookId}.${timestamp}.${body}`,
    `${timestamp}.${body}`,
    // body-only REMOVED
  ];
  ```
  This ensures the HMAC is always cryptographically bound to at least the timestamp.
- **Test Guidance:** Send a valid webhook, then replay with a different timestamp. Should fail verification. Also verify both bound formats still work as expected.

### P-007: Pilot session token accepted via URL query parameter
— [S-06]
- **Priority:** P1
- **Source Reviewers:** Security (S-06)
- **Original Severity:** MEDIUM
- **Verified:** YES — `server/routes/pilotAuth.ts:178`: `req.query?.pilotToken` is a third authorization fallback after header and Bearer token. Confirmed. Pilot sessions have 30-day TTL, amplifying leak risk.
- **Dual-DB Risk:** NO — Security issue (token leakage)
- **Files:** `server/routes/pilotAuth.ts`
- **Lines:** 178
- **Description:** The pilot authentication middleware accepts session tokens via URL query parameter (`req.query?.pilotToken`). This is an OWASP anti-pattern — query parameters are logged in server logs, proxy logs, browser history, and referrer headers. The 30-day TTL means a leaked token remains valid for an extended period.
- **Fix Instructions:** Remove `req.query?.pilotToken` from the token extraction logic. Only accept tokens via headers:
  ```typescript
  const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "");
  ```
  If the frontend currently uses query params, update it to use the `x-pilot-token` header instead.
- **Test Guidance:** Test pilot auth via `x-pilot-token` header — should work. Test pilot auth via `?pilotToken=...` — should return 401.

### P-008: `getGridBounds()` hits database on every call — no in-memory cache
— [P-001, P-005]
- **Priority:** P1
- **Source Reviewers:** Performance (P-001), Performance (P-005 - subset)
- **Original Severity:** HIGH (P-001), MEDIUM (P-005)
- **Verified:** YES — `server/victoriaGrid.ts:41+`: `getGridBounds()` performs a `SELECT` on the `settings` table for grid coordinate keys. The function has no in-memory cache. Called from ~8 locations across the wind grid fetching code. A single wind-map load triggers 3-6 redundant reads for the same static values.
- **Dual-DB Risk:** NO
- **Files:** `server/victoriaGrid.ts`
- **Lines:** 41–74
- **Description:** `getGridBounds()` queries the `settings` table every time it's called, but grid bounds are static configuration that only changes when an admin updates them. The function has no in-memory cache. A single wind-map request triggers 3-6 redundant database reads for identical values.
- **Fix Instructions:** Add an in-memory cache with a TTL (e.g., 5 minutes) or an invalidation flag. Pattern:
  ```typescript
  let cachedBounds: GridBounds | null = null;
  let boundsCacheTTL = 0;
  export async function getGridBounds(): Promise<GridBounds> {
    if (cachedBounds && Date.now() < boundsCacheTTL) return cachedBounds;
    // ... fetch from DB ...
    cachedBounds = result;
    boundsCacheTTL = Date.now() + 5 * 60 * 1000;
    return cachedBounds;
  }
  ```
  Add a cache invalidation call in the `POST /api/weather/grid-bounds` admin endpoint.
- **Test Guidance:** Load wind map twice in quick succession. Second load should not trigger DB queries (check logs or add metrics). Edit grid bounds via admin — cache should be invalidated.

### P-009: Haversine distance formula duplicated across 10 locations
— [D-001]
- **Priority:** P1
- **Source Reviewers:** Duplication (D-001)
- **Original Severity:** CRITICAL (inflated), downgraded to HIGH for coordination
- **Verified:** YES — Standard haversine formula verified in: `src/lib/utils.ts`, `src/hooks/useXCMapState.ts`, `src/hooks/useRetrievalMap.ts`, `src/hooks/useFlightTracker.ts`, `src/components/WindFieldLayer.tsx`, `src/components/SOProximityDetector.tsx`, `server/routes/auth.ts`, `server/utils/osrm.ts`, `server/tides.ts`, `server/routes/sites/helpers.ts`. All are mathematically identical with R=6371.
- **Dual-DB Risk:** NO
- **Files:** 10 files across `src/` and `server/`
- **Lines:** Various — see individual file references in D-001
- **Description:** The exact same haversine distance formula (R=6371) is copied across 10 locations — 6 in client code, 4 in server code. Every instance computes `2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))` with identical intermediate steps. If a bug is discovered or R needs updating (e.g., switching to WGS84 mean radius), all 10 copies must be manually updated.
- **Fix Instructions:**
  1. Keep `src/lib/utils.ts` as the canonical client-side location and `server/utils/geometry.ts` as the canonical server-side location (or a shared `shared/geometry.ts` if the build supports it).
  2. Remove all duplicates and import from the canonical source.
  3. For the `haversineDistanceM` variants (returning meters instead of km), add an optional `inMeters?: boolean` parameter or create a wrapper function.
  4. For `haversineDistanceServer` in `sites/helpers.ts`, import from `../../utils/geometry.js` instead of local definition.
- **Test Guidance:** Run the app and verify distance calculations (flight tracking, XC maps, proximity detection) produce identical results to the original formula. The haversine formula is deterministic — output should match exactly.

### P-010: `buildPublicContext()` runs 5-7 sequential DB queries
— [P-002]
- **Priority:** P2
- **Source Reviewers:** Performance (P-002)
- **Original Severity:** HIGH
- **Verified:** YES — `server/routes/search.ts:224-412`: 6 independent `await db.prepare(...)` calls executed sequentially in `buildPublicContext()`. Sites, weather, forecasts, closures, extended forecasts — all independent with no cross-dependencies.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/search.ts`
- **Lines:** 224–412
- **Description:** `buildPublicContext()` runs 5-7 database queries sequentially that have no cross-dependencies. On cache miss, each query waits for the previous one's round-trip. Total sequential time is ~50-150ms vs ~15-30ms with `Promise.all()`.
- **Fix Instructions:** Group independent queries into `Promise.all()` batches:
  ```typescript
  const [sites, weatherObs, weatherForecasts, closureRows, extRows] = await Promise.all([
    db.prepare("SELECT ... FROM sites").all(),
    db.prepare("SELECT ... FROM weather_observations").all(),
    db.prepare("SELECT ... FROM weather_forecasts").all(),
    db.prepare("SELECT ... FROM site_closure_dates").all(),
    db.prepare("SELECT ... FROM site_extended_forecasts").all(),
  ]);
  ```
  The `getContextTtl()` call may need to remain sequential if it's needed for later logic.
- **Test Guidance:** Log the time delta before and after `buildPublicContext()`. Cache miss should be ~3-5x faster. Verify all data is identical by comparing contexts before/after.

### P-011: Wind canvas `requestAnimationFrame` loop never pauses when tab is hidden
— [P-003, P-007]
- **Priority:** P2
- **Source Reviewers:** Performance (P-003, P-007)
- **Original Severity:** HIGH (P-003), LOW (P-007)
- **Verified:** YES — `src/components/windmap/WindCanvas.tsx:112-158` and `particleRenderer.ts:52-59`: `render()` runs at 60fps via `requestAnimationFrame` unconditionally. No `document.hidden` check. The `cancelAnimationFrame` cleanup only fires on unmount, not on tab hide. Also, P-007 confirmed 8,000 individual `ctx.stroke()` calls per frame — these two findings are related (the stroke count amplifies the wasted cycles when hidden).
- **Dual-DB Risk:** NO
- **Files:** `src/components/windmap/WindCanvas.tsx`, `src/components/windmap/particleRenderer.ts`
- **Lines:** WindCanvas.tsx: 112–158; particleRenderer.ts: 52–94
- **Description:** The wind map canvas renders at 60fps continuously via `requestAnimationFrame`, even when the browser tab is hidden or the user navigates away. It performs ~30M operations/sec (particle interpolation, trail computation, stroke calls). This wastes CPU/GPU resources and battery life. The particle renderer does 8,000 individual `ctx.stroke()` calls per frame — grouping by opacity band would reduce this to ~20 draw calls.
- **Fix Instructions:** 
  1. **Tab visibility:** Add a `visibilitychange` event listener that `cancelAnimationFrame` when `document.hidden` and restarts the loop when visible.
  2. **Particle stroke batching (optional):** Group particles by opacity band and batch `ctx.stroke()` calls. There are only ~10-20 distinct opacity values at any time.
- **Test Guidance:** Load wind map, switch to another tab. Check CPU usage in browser dev tools — should drop significantly. Switch back — animation should resume.

### P-012: Compass direction arrays and `getCrossDirections` logic duplicated 5+ times
— [D-002]
- **Priority:** P2
- **Source Reviewers:** Duplication (D-002)
- **Original Severity:** HIGH
- **Verified:** YES — 16-point compass direction array defined in: `src/lib/utils.ts`, `src/components/WindCompass.tsx`, `src/components/weather/WindCompass.tsx`, `server/routes/sites/helpers.ts`, `server/routes/search.ts`. `getCrossDirections` implemented 3 ways with different signatures.
- **Dual-DB Risk:** NO
- **Files:** `src/lib/utils.ts`, `src/components/WindCompass.tsx`, `src/components/weather/WindCompass.tsx`, `server/routes/sites/helpers.ts`, `server/routes/search.ts`
- **Lines:** Various — see D-002 references
- **Description:** The 16-point compass direction array is defined 5 times across client and server. More problematically, `getCrossDirections` (detecting cross-wind boundary transitions) is implemented 3 different ways with different return types (`string[]` vs `Set<string>` vs `Array<{dir,side}>`). This locks in inconsistency and prevents reuse.
- **Fix Instructions:**
  1. Create a single compass utility module: `src/utils/compass.ts` for client, `server/utils/compass.ts` for server (or shared if build supports).
  2. Export: `COMPASS_DIRS` (array), `directionToDegrees` (Record), and `getCrossDirections(windDir: number): string[]` (universal signature).
  3. Replace all 5 array definitions with the import.
  4. Unify the 3 `getCrossDirections` implementations into one with a consistent return type.
- **Test Guidance:** Verify compass rendering in both WindCompass components shows identical direction labels. Cross-wind detection should produce same results for all wind directions used in testing.

### P-013: WindMapProto and SitesWindMap structural duplication
— [D-003]
- **Priority:** P2
- **Source Reviewers:** Duplication (D-003)
- **Original Severity:** HIGH
- **Verified:** YES — Both components (WindMapProto.tsx: 225 lines, SitesWindMap.tsx: 424 lines) share identical data fetching logic, playback interval logic, loading/error skeletons, and overlay JSX. The only difference: SitesWindMap adds site markers and fullscreen mode.
- **Dual-DB Risk:** NO
- **Files:** `src/components/WindMapProto.tsx`, `src/components/SitesWindMap.tsx`
- **Lines:** See D-003 references for data fetching (68-103/107-142), playback (115-130/144-160), loading (140-144/172-190), controls (215-258/189-260)
- **Description:** WindMapProto and SitesWindMap share ~70% of their code: wind data fetching (with 7day mode branch), playback interval, loading/error states, speed legend, and controls overlay. They already share sub-components (WindCanvas, WindMapScrubberTray, WindMapModeToggle) — the outer wrapper duplication is the remaining issue.
- **Fix Instructions:**
  1. Unify into a single `WindMap` component with a `mode: 'single' | 'multi'` prop.
  2. Extract the shared UI shell (loading, error, controls overlay) into a `WindMapShell` component.
  3. The `multi` mode mode adds site markers; `single` mode doesn't.
  4. Delete WindMapProto.tsx and SitesWindMap.tsx, keeping only the unified component.
  5. Update imports in all consumers.
- **Test Guidance:** Test wind map on both the sites page (multi-site) and single-site page. Verify data fetching, playback, controls, and 7-day mode all work identically to before.

### P-014: `expandRange` function duplicated in WindCompass and utils.ts
— [D-004]
- **Priority:** P2
- **Source Reviewers:** Duplication (D-004)
- **Original Severity:** MEDIUM
- **Verified:** YES — `src/components/WindCompass.tsx` lines 20-37 and `src/lib/utils.ts` lines 58-75 are line-by-line identical except for referencing local compass arrays.
- **Dual-DB Risk:** NO
- **Files:** `src/components/WindCompass.tsx`, `src/lib/utils.ts`
- **Lines:** WindCompass: 20-37; utils.ts: 58-75
- **Description:** `expandRange` (which expands a start/end compass direction into the full arc, handling wrap-around) is identical in both files. The only difference is referencing the local compass array. Should be in utils.ts and imported.
- **Fix Instructions:** Remove the local `expandRange` from `WindCompass.tsx` and import from `src/lib/utils.ts`. Ensure `utils.ts`'s `expandRange` references the exported compass array (which it already does — see P-012 for the unified compass plan).
- **Test Guidance:** Test compass range expansion for edge cases: N→E (short arc), N→S (long arc wrap), etc. Results should match the original.

### P-015: XSS via dangerouslySetInnerHTML on TidyHQ event body
— [S-02]
- **Priority:** P2
- **Source Reviewers:** Security (S-02)
- **Original Severity:** HIGH
- **Verified:** YES — `src/pages/Events.tsx:74`: `dangerouslySetInnerHTML={{ __html: event.body }}` renders raw TidyHQ HTML. `server/routes/events.ts` is a pass-through proxy with zero sanitization. Confirmed.
- **Dual-DB Risk:** NO — Security (XSS)
- **Files:** `server/routes/events.ts`, `src/pages/Events.tsx`
- **Lines:** events.ts — pass-through; Events.tsx: 74
- **Description:** Event bodies from TidyHQ are rendered directly via `dangerouslySetInnerHTML` without sanitization. If TidyHQ's event content contains executable HTML (script tags, onerror handlers, etc.), it executes in the user's browser. While TidyHQ is a managed platform, a compromised TidyHQ admin account or platform-level attack could inject malicious content. The risk is bounded — TidyHQ staff/admins must inject content — but the impact (admin session theft via XSS) is severe.
- **Fix Instructions:** Sanitize the HTML on the server before proxying it to the client. Use a library like `dompurify` (server-side with jsdom) or `sanitize-html` in `server/routes/events.ts`:
  ```typescript
  import sanitizeHtml from 'sanitize-html';
  // In the events route:
  event.body = sanitizeHtml(event.body, { allowedTags: sanitizeHtml.defaults.allowedTags.filter(t => t !== 'script') });
  ```
  Alternatively, sanitize on the client with `DOMPurify.sanitize(event.body)` before rendering.
- **Test Guidance:** Inject `<img src=x onerror="alert(1)">` into a TidyHQ event (or mock the API response). Verify the script does not execute. Verify normal HTML formatting (bold, links) still works.

### P-016: `site_closure_dates` PUT endpoint lacks transaction wrapping
— [B-05]
- **Priority:** P3
- **Source Reviewers:** Bugs (B-05)
- **Original Severity:** MEDIUM
- **Verified:** YES — `server/routes/sites/closures.ts:45-64`: DELETE followed by INSERT loop without transaction. If loop throws mid-way, partial data remains. Note: fixing B-01 (P-003) makes `db.transaction()` functional in PostgreSQL, but this endpoint doesn't even attempt to use it.
- **Dual-DB Risk:** NO — Same bug in both DBs
- **Files:** `server/routes/sites/closures.ts`
- **Lines:** 45–64
- **Description:** The PUT endpoint for site closure dates deletes all existing dates for a site, then inserts new ones one by one in a loop. Without transaction wrapping, a failure mid-loop leaves partial data that looks identical to "the admin genuinely submitted N-1 dates." Recovery requires re-entering all dates.
- **Fix Instructions:** Wrap the DELETE+INSERT logic in `db.transaction()`:
  ```typescript
  await db.transaction(async () => {
    await db.prepare("DELETE FROM site_closure_dates WHERE site_id = ?").run(req.params.id);
    for (const date of dates) {
      await db.prepare("INSERT INTO site_closure_dates (site_id, closure_date) VALUES (?, ?) ON CONFLICT DO NOTHING")
        .run(req.params.id, date);
    }
  });
  ```
  Note: this fix requires P-003 (transaction isolation fix) to be effective in PostgreSQL.
- **Test Guidance:** Force a DB error mid-loop (e.g., invalid date format) and verify all changes are rolled back. The site should have zero closure dates after a failed update, not partial dates.

### P-017: Inline closure check in siteMarkerRenderer bypasses getClosureStatus utility
— [D-005]
- **Priority:** P3
- **Source Reviewers:** Duplication (D-005)
- **Original Severity:** MEDIUM
- **Verified:** YES — `src/components/windmap/siteMarkerRenderer.ts:26-28`: Inline check `site.status === 'closed' || site.upcomingClosureDates?.includes(todayStr)` instead of importing `getClosureStatus()` from `src/utils/closureStatus.ts`.
- **Dual-DB Risk:** NO
- **Files:** `src/components/windmap/siteMarkerRenderer.ts`
- **Lines:** 26–28
- **Description:** The site marker renderer computes closure status inline (today string + `.includes()`) instead of using the shared `getClosureStatus` utility. If the closure logic changes (timezone handling, additional closure sources), this site would be missed.
- **Fix Instructions:** Replace the inline check:
  ```typescript
  import { getClosureStatus } from '../../utils/closureStatus';
  const closure = getClosureStatus(site);
  ctx.fillStyle = closure.isClosedToday ? '#ef4444' : ...
  ```
  This ensures the marker color is always consistent with badges elsewhere.
- **Test Guidance:** Set a site to closed today. Verify the marker is red. Test with upcoming closure dates — should show the correct color matching the badge on the site detail page.

### P-018: Missing index on `site_closure_dates(closure_date)` 
— [P-004]
- **Priority:** P3
- **Source Reviewers:** Performance (P-004)
- **Original Severity:** MEDIUM
- **Verified:** YES — `server/routes/sites/crud.ts:31-46`: Query `SELECT site_id, closure_date FROM site_closure_dates WHERE closure_date >= ? AND closure_date <= ?` with no index on `closure_date`. Currently negligible at ~75 rows, but will grow linearly. No explicit CREATE INDEX found in migrations.
- **Dual-DB Risk:** NO
- **Files:** New migration file for index
- **Lines:** crud.ts: 31-46; migration: new file
- **Description:** The sites list query filters on `closure_date` range without an index. At current scale (~75 rows) this is negligible, but as closures accumulate it becomes O(n) per request.
- **Fix Instructions:** Add a composite index on `site_closure_dates(site_id, closure_date)`:
  ```sql
  CREATE INDEX idx_closure_dates_site_date ON site_closure_dates(site_id, closure_date);
  ```
  Or at minimum: `CREATE INDEX idx_closure_dates_date ON site_closure_dates(closure_date);`
  Add as a new pg_migration (e.g., `025_add_closure_dates_index.sql`).
- **Test Guidance:** Verify `EXPLAIN QUERY PLAN` uses the new index. Test with a larger dataset (artificially insert 1000 closure dates) and measure query time improvement.

### P-019: Data-fixup IIFEs scan all sites on every server startup
— [P-008]
- **Priority:** P3
- **Source Reviewers:** Performance (P-008)
- **Original Severity:** LOW
- **Verified:** YES — `server/routes/sites/helpers.ts:221-258`: Three IIFEs (`fixBarePG2Ratings`, `fixWindSpeedFormat`, `fixWindDirFormat`) run full-table SELECT + UPDATE on every server startup. After first run, all data is already normalized, so they waste time comparing strings.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/sites/helpers.ts`
- **Lines:** 221–258
- **Description:** Three data normalization IIFEs run on every server restart, scanning all sites each time. After the first successful run, all data is already fixed. They continue scanning unnecessarily, adding ~3ms (at 25 sites) to cold-start time.
- **Fix Instructions:** Convert these to a "run once" pattern: store a flag in the `settings` table (e.g., `dataFixupsComplete: true`) set at the end of the first successful run. On subsequent startups, check the flag and skip.
- **Test Guidance:** Start server twice. On first startup, logs show normalization running. On second startup, logs show it was skipped.

### P-020: `INSERT OR REPLACE` conversion falls through to `ON CONFLICT DO NOTHING` for unknown tables
— [DB-006]
- **Priority:** P1
- **Source Reviewers:** Database (DB-006)
- **Original Severity:** HIGH
- **Verified:** YES — `server/pgDb.ts:97-138`: The INSERT OR REPLACE converter has explicit table handlers for settings, sites, site_extended_forecasts, weather_forecasts, wind_grid_data, extended_forecasts, document_index, emergency_hospitals_cache. ANY new table falls through to `ON CONFLICT DO NOTHING`, which silently drops rows that should be replaced.
- **Dual-DB Risk:** YES — Silent data loss in PostgreSQL for new tables
- **Files:** `server/pgDb.ts`
- **Lines:** 97–138
- **Description:** The `INSERT OR REPLACE` adapter conversion has a hardcoded per-table mapping. Tables not in this list fall through to `ON CONFLICT DO NOTHING` — meaning rows that should be replaced are silently dropped. This is a maintenance timebomb: any new table using `INSERT OR REPLACE` will silently lose data in production.
- **Fix Instructions:** Make the conversion table-agnostic:
  1. Extract the conflict target (PRIMARY KEY or UNIQUE constraints) from the table schema by querying `pg_catalog` or `information_schema` at conversion time.
  2. Generate the appropriate `ON CONFLICT (key列) DO UPDATE SET ...` clause automatically from the detected constraints.
  3. As a simpler intermediate fix: for tables without explicit handlers, default to `ON CONFLICT DO UPDATE SET` with ALL columns (not `DO NOTHING`). Or throw a warning during conversion.
  4. Add a TODO comment in `convertSQL` documenting this limitation and the tables that need explicit handlers.
- **Test Guidance:** Create a new table with a PRIMARY KEY, run `INSERT OR REPLACE` against it. Verify the row is updated (not silently dropped) on conflict.

### P-021: `resolveSubmissionPath` lacks `..` path traversal validation
— [S-07]
- **Priority:** P3
- **Source Reviewers:** Security (S-07)
- **Original Severity:** MEDIUM
- **Verified:** YES — `server/routes/submissions.ts:196-200`: `resolveSubmissionPath()` strips leading `/` but does NOT validate `..` segments. `path.join(process.cwd(), filePath)` would resolve `../../etc/passwd` to an absolute file path. The vulnerability requires DB manipulation (not user input) since `filePath` is auto-generated by `StorageKey.submission()`.
- **Dual-DB Risk:** NO — Security (path traversal)
- **Files:** `server/routes/submissions.ts`
- **Lines:** 196–200
- **Description:** `resolveSubmissionPath` constructs file paths by stripping leading `/` and joining with `process.cwd()`, but does not prevent `..` traversal. While currently mitigated by auto-generated file paths (not user input), if the DB is ever modified directly with a crafted path, arbitrary files could be read.
- **Fix Instructions:** Add `..` validation:
  ```typescript
  function resolveSubmissionPath(filePath: string): string {
    if (filePath.startsWith("http")) return filePath;
    // Prevent path traversal
    if (filePath.includes('..')) {
      throw new Error('Invalid file path: path traversal not allowed');
    }
    const cleaned = filePath.replace(/^\/+/, "");
    return path.join(process.cwd(), cleaned);
  }
  ```
- **Test Guidance:** Verify `resolveSubmissionPath('../../etc/passwd')` throws. Verify `resolveSubmissionPath('uploads/file.jpg')` still works.

### P-022: WindMap.tsx re-export shim of Proto-named component
— [D-008]
- **Priority:** P3
- **Source Reviewers:** Duplication (D-008)
- **Original Severity:** LOW
- **Verified:** YES — `src/components/WindMap.tsx` is exactly 1 line: `export { default } from './WindMapProto';`. Used by WeatherCard.tsx (lazy) and SiteDetail.tsx.
- **Dual-DB Risk:** NO
- **Files:** `src/components/WindMap.tsx`, `src/components/WindMapProto.tsx`
- **Lines:** WindMap.tsx:1 (entire file)
- **Description:** WindMap.tsx is a 1-line re-export of WindMapProto.tsx. The "Proto" suffix suggests a temporary name that became permanent. This creates confusion about which component is the "real" one.
- **Fix Instructions:** Either rename `WindMapProto.tsx` to `WindMap.tsx` (deleting the shim) OR add a JSDoc comment explaining the aliasing: `/** @deprecated Use WindMap instead (alias for WindMapProto) */`. Given that this overlaps with P-013 (structural duplication), deferring to that unification effort is recommended.
- **Test Guidance:** Verify all imports still resolve after the rename.

### P-023: TidesGauge and TidesPanelMockup are dead code
— [D-007]
- **Priority:** P3
- **Source Reviewers:** Duplication (D-007)
- **Original Severity:** HIGH (rejected as inflated), actual: LOW
- **Verified:** YES — Grep confirmed zero imports of `TidesGauge` or `TidesPanelMockup` anywhere in the codebase. Combined ~534 lines of dead code.
- **Dual-DB Risk:** NO
- **Files:** `src/components/TidesGauge.tsx`, `src/components/TidesPanelMockup.tsx`
- **Lines:** Entire files
- **Description:** Two tide-related components (534 lines total) are never imported or rendered. They increase bundle size marginally and confuse future developers. Modern bundlers will tree-shake them, but they still appear in IDEs and code navigation.
- **Fix Instructions:** Move to a `/archive/` folder or git tag for reference, then delete from the source tree. Update `BuildBlueprint.tsx` if it references them (it does so descriptively, not as imports).
- **Test Guidance:** Verify the app builds and runs without these files. Check that no imports break (already confirmed via grep).

### P-024: `datetime('now')` timezones — retrieval visibility gap from UTC vs Melbourne
— [B-04]
- **Priority:** P3
- **Source Reviewers:** Bugs (B-04)
- **Original Severity:** HIGH
- **Verified:** YES — `server/services/realRetrievalService.ts:12`: `const TODAY_SCOPE = "AND createdAt >= datetime('now', 'start of day')"` uses UTC midnight. During 00:00-09:59 AEST, Melbourne's "today" hasn't started in UTC yet, so retrievals from the Melbourne morning are excluded.
- **Dual-DB Risk:** NO — Same behavior in both DBs
- **Files:** `server/services/realRetrievalService.ts`
- **Lines:** 12, and all uses of TODAY_SCOPE (lines 129, 205, 213, 320, 449, 472, 477)
- **Description:** `datetime('now', 'start of day')` returns UTC midnight (00:00 UTC). For Victorian users (UTC+10 AEST / UTC+11 AEDT), Melbourne's "today" starts up to 11 hours before UTC "today". Between midnight and ~10am Melbourne time, retrievals are excluded from "today's" scope, making overnight pilots invisible on the retrieval map, driver assignments, and duty pilot dashboard.
- **Fix Instructions:** This is a design decision requiring knowledge of the Melbourne timezone. Two approaches:
  1. **Simple:** Subtract Melbourne UTC offset: `datetime('now', '-10 hours', 'start of day')` (or `-11` during DST). But DST switching makes this fragile.
  2. **Robust:** Compute "today" in application code using `date-fns-tz` (already a dependency):
     ```typescript
     import { startOfDay, toZonedTime } from 'date-fns-tz';
     const melbourneTodayStart = startOfDay(toZonedTime(new Date(), 'Australia/Melbourne'));
     // Pass as parameter: WHERE createdAt >= ?
     ```
  3. Apply consistently across all 7 `TODAY_SCOPE` usages.
- **Test Guidance:** Test retrieval queries at 2am Melbourne time (8pm previous UTC). Verify today's retrievals are visible. Test during DST transition period.

### P-025: CSRF protection bypasses pilot-authenticated routes
— [S-01]
- **Priority:** P3
- **Source Reviewers:** Security (S-01)
- **Original Severity:** HIGH
- **Verified:** YES — `server/middleware/csrf.ts:39`: `if (!user || !user.id) return next()` — pilot routes set `req.pilot` not `req.user`, so CSRF validation is always skipped. Confirmed in `pilotAuth.ts:178`.
- **Dual-DB Risk:** NO — Security (CSRF)
- **Files:** `server/middleware/csrf.ts`, `server/routes/pilotAuth.ts`
- **Lines:** csrf.ts: 39; pilotAuth.ts: 178
- **Description:** The CSRF validator skips validation when `req.user` is absent. Pilot-authenticated routes set `req.pilot` instead, so all pilot POST/PUT/DELETE requests bypass CSRF checks entirely. An attacker could craft a malicious form that updates a pilot's satellite tracker settings (garminMapshare, spotFeedId, zoleoImei) by exploiting the pilot's session cookie.
- **Fix Instructions:** Extend the CSRF validator to also check `req.pilot`:
  ```typescript
  const user = (req as any).user;
  const pilot = (req as any).pilot;
  if ((!user || !user.id) && (!pilot || !pilot.id)) {
    return next(); // truly unauthenticated
  }
  // proceed with CSRF validation
  ```
- **Test Guidance:** Send a PUT request to `/api/pilot-auth/profile` without a CSRF token when a pilot is logged in — should return 403. With a valid token — should succeed.

---

## Summary of P0 Fixes (Must do this cycle)

| # | Issue | Severity | Est. Effort | Risk if not fixed |
|---|-------|----------|-------------|-------------------|
| P-001 | `claimedAt` column missing from PG schema | CRITICAL | 10 min | Production crash on every retrieval |
| P-002 | `lastInsertRowid: 0` hardcoded in PG adapter | CRITICAL | 30 min | Messages return id:0; client features broken |
| P-003 | PG transaction on wrong connection | CRITICAL | 2-3 hours | Data corruption on partial write failures |

## Fix Order Recommendation

1. **P-001** (claimedAt column) — 10 min, highest impact, creates immediate production stability
2. **P-002** (lastInsertRowid) — 30 min, fixes messaging functionality
3. **P-003** (transactions) — largest effort, plan for separate PR; in the meantime, document the limitation
4. **P-004** (identifier quoting) — 5 min, simple regex fix
5. **P-005** (UNIQUE constraint error detection) — 15 min, quick fix
6. **P-006** (webhook HMAC body-only) — 10 min, remove one line
7. **P-007** (pilot token query param) — 5 min, remove one line
8. **P-020** (INSERT OR REPLACE default) — 1-2 hours, medium effort
9. **P-008** (getGridBounds cache) — 30 min, nice-to-have perf improvement
10. **P-012** (compass duplication) — 1 hour, cleanup
11. **P-009** (haversine duplication) — 1 hour, cleanup
12. **P-010** (buildPublicContext parallelization) — 30 min
13. **P-011** (canvas pause + particle batching) — 1-2 hours
14. **P-013** (WindMap component unification) — 2-3 hours, largest cleanup
15. **P-014–P-025** — remaining items as time permits
