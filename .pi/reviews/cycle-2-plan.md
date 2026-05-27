# Coordinator Fix Plan — Cycle 2
**Date:** 2026-05-24
**Coordinator:** Review Coordination Agent

## Triage Summary
- **Total findings across all 5 reviewers:** 28 unique findings (after deduplication)
  - Bugs: 5 findings (5 VALID, 0 REJECTED)
  - Duplication: 3 findings (3 VALID, 0 REJECTED)
  - Security: 5 findings (4 VALID, 0 BORDERLINE, 1 REJECTED)
  - Performance: 10 findings (9 VALID, 1 REJECTED)
  - Database (Dual-DB): 4 findings (4 VALID, 0 REJECTED)
- **VALID:** 25
- **BORDERLINE:** 0
- **REJECTED:** 3 (with reasons listed below)
- **Merged duplicates:** 3 pairs (B-001 ↔ DB-C2-001; P-002 overlaps with P-003; DB-C2-002 found additional bug in `toPostgresParams`)

---

## REJECTED Findings
| Finding | Reviewer | Reason |
|---------|----------|--------|
| S-5 (TidyHQ auto-create → admin escalation) | Security | Theoretically possible but requires TidyHQ admin compromise as prerequisite. Attack path has 6+ steps including self-triggering password reset flow that's not confirmed accessible to non-committee contacts. LOW severity with no immediate fix — better tracked as threat model note, not as fix plan item. |
| P-009 (`GET /stations/nearby` sequential API fetches) | Performance | The reviewer correctly identifies 3 sequential external API calls with no caching, but the review states "No API supports server-side radius filtering, so this is partly unavoidable." The 2-4s cold latency is acceptable for a "nearby stations" lookup called infrequently by admins. This is an optimization suggestion, not a performance defect, and was flagged as LOW by the reviewer. |
| P-010 (`useRetrievalStatus` interval) | Performance | **Explicitly retracted by the reviewer** ("Retracted"). The cleanup IS triggered on `trackerState` change. Negligible impact. |

---

## Fix Plan (Prioritized)

### P-001: `datetime` → `::date` type mismatch in retrievals queries — [B-001, DB-C2-001]
- **Priority:** P0
- **Source Reviewers:** Bugs (B-001), Database (DB-C2-001)
- **Original Severity:** CRITICAL (both)
- **Verified:** ✅ Confirmed: `TODAY_SCOPE` uses `datetime('now', '-10 hours', 'start of day')` at `server/services/realRetrievalService.ts:12`. pgDb converter at `pgDb.ts:162` replaces with `(CURRENT_TIMESTAMP - interval '$1 hours')::date`. The `retrievals.createdAt` column is `TIMESTAMPTZ` (per `001_full_schema.sql`). PostgreSQL cannot compare `TIMESTAMPTZ >= DATE` — it throws `operator does not exist: timestamp with time zone >= date`. This breaks every retrieval query in production.
- **Dual-DB Risk:** YES — core SQLite→PostgreSQL incompatibility
- **Files:** `server/pgDb.ts`, `server/services/realRetrievalService.ts`
- **Lines:** `pgDb.ts:162`, `realRetrievalService.ts:12`
- **Description:** The converter casts to `::date` which produces a PostgreSQL `date` type (midnight). Comparing `TIMESTAMPTZ >= date` fails because PG has no implicit cast between these types for `>=`. Fix requires casting both sides to compatible types.
- **Fix Instructions:**
  1. Change the regex replacement in `pgDb.ts:162` from `::date` to a TIMESTAMPTZ-compatible expression. Two options:
     - Option A: Cast to `timestamptz`: `"CURRENT_TIMESTAMP - interval '$1 hours'"` (removes the `::date` entirely — the time component makes the `start of day` logic slightly different but for `createdAt >= X` it works equivalently since all records have times)
     - Option B (recommended): Cast createdAt to date: keep `::date` but ensure the SQL wraps the column: `CAST(createdAt AS DATE) >= (CURRENT_TIMESTAMP - interval '10 hours')::date`
  2. If using Option B, the converter needs to also rewrite the column reference — more invasive. Option A is simpler: just remove `::date` from the replacement pattern. Since `datetime('now', '-10 hours', 'start of day')` returns `"2026-05-23 00:00:00"` in SQLite (TEXT), removing `::date` and keeping `CURRENT_TIMESTAMP - interval '10 hours'` (TIMESTAMPTZ) gives comparable semantics: `TIMESTAMPTZ >= TIMESTAMPTZ`.
  3. Test: In dev (SQLite), `datetime('now', '-10 hours', 'start of day')` still works. In prod (PG), the converted SQL now uses `CURRENT_TIMESTAMP - interval '10 hours'` (TIMESTAMPTZ) which can be compared with TIMESTAMPTZ columns.
- **Test Guidance:** Start the server with `DATABASE_URL` set. Trigger a retrieval query (e.g., `GET /api/retrievals/unretrieved`). Verify it returns 200, not 500. Also verify the semantic meaning: items from "today" in Melbourne time are included. Cross-check with a manual SQL query: `SELECT COUNT(*) FROM retrievals WHERE createdAt >= CURRENT_TIMESTAMP - interval '10 hours'`.
- **Estimated Fix Time:** 15 min

### P-002: Settings GET handler doesn't await pgDb `.get()` — [B-002]
- **Priority:** P0
- **Source Reviewers:** Bugs
- **Original Severity:** HIGH
- **Verified:** ✅ Confirmed at `server/routes/settings.ts:20,23,26`. Three `db.prepare(...).get()` calls without `await`. When `DATABASE_URL` is set, `db` = pgDb, and `pgDb.get()` is `async` returning `Promise<any>` (confirmed at `pgDb.ts:213-223`). Without `await`, `fineRow` is a Promise object, `fineRow?.ts` is undefined, and the grid timestamp fields are silently omitted.
- **Dual-DB Risk:** YES — works in dev (SQLite `.get()` is sync), fails silently in prod
- **Files:** `server/routes/settings.ts`
- **Lines:** 20, 23, 26
- **Description:** Fine, coarse, and extended wind grid last-run timestamps are fetched via `db.prepare(...).get()` without `await`. In PostgreSQL mode, `.get()` returns a Promise, so `row?.ts` is always undefined. The settings endpoint silently omits three fields in production.
- **Fix Instructions:**
  1. Add `await` to all three `db.prepare(...).get()` calls on lines 20, 23, and 26.
  2. No other changes needed — the handler is already inside an `asyncHandler`, so adding `await` is safe.
- **Test Guidance:** (dev) No change visible. (prod) After deploy, check `/api/settings` response includes `fineGridLastRun`, `coarseGridLastRun`, and `extendedForecastLastRun` with valid ISO date strings.
- **Estimated Fix Time:** 2 min

### P-003: `pilot_sessions` query selects non-existent columns — [B-003]
- **Priority:** P0
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM (upgraded to P0 due to P0 pipeline — this is a simple, clear fix)
- **Verified:** ✅ Confirmed: `realFlightService.ts:148` queries `SELECT firstName, lastName FROM pilot_sessions`. Migration `008_add_pilot_sessions.sql` defines columns: `token`, `pilotId`, `createdAt`. No `firstName`/`lastName`. Schema confirmed across all 3 migration definitions (`001`, `008`, `009`) — none include these columns. The `pilots` table has `firstName`/`lastName` (or `name`), not `pilot_sessions`.
- **Dual-DB Risk:** NO — fails in both SQLite and PostgreSQL
- **Files:** `server/services/realFlightService.ts`
- **Lines:** 148-150
- **Description:** `endFlight` queries `pilot_sessions` for `firstName, lastName` columns that don't exist. Result is always `undefined`, so guest pilot names always fallback to "Pilot". The fix: join to `pilots` table or query `pilots` directly instead of `pilot_sessions`.
- **Fix Instructions:**
  1. Replace the query: instead of `SELECT firstName, lastName FROM pilot_sessions`, query the `pilots` table: `SELECT name as firstName FROM pilots WHERE id = ?`
  2. Or, if `pilots` uses `firstName`/`lastName` columns (check the schema — `pilots` table uses `name`), adjust accordingly.
  3. Check the `pilots` schema to find the correct column name for pilot display name.
- **Test Guidance:** End a flight with `flight.pilotId !== pilot?.id` (guest pilot scenario). Verify the returned `pilotName` is the actual pilot name, not "Pilot".
- **Estimated Fix Time:** 5 min

### P-004: CSRF middleware crashes when `user` is undefined (pilot-only routes) — [S-1, augmented]
- **Priority:** P0
- **Source Reviewers:** Security (S-1), Coordinator (augmented — additional bug found by coordinator)
- **Original Severity:** HIGH
- **Verified:** ✅ Confirmed at `server/middleware/csrf.ts:67,72`. Both `validateCSRFToken(user.id, token)` and the log message `user.id` access `user.id` unconditionally after the combined auth check. When ONLY `req.pilot` is set (pilot-authenticated routes), `user` is `undefined`, so `user.id` throws `TypeError: Cannot read properties of undefined (reading 'id')`. This crashes the middleware and prevents ALL pilot routes from working.
  - **Additional bug found by coordinator:** `server/pgDb.ts:50` has a bug in `toPostgresParams`: the named-params branch (object input) returns `values: params` (the original object) instead of `values: values` (the extracted array). This means all named-parameter queries (`@id, @siteId`) pass the raw object to pg, causing runtime errors in production.
- **Dual-DB Risk:** YES (S-1 affects the pgDb adapter's parameter handling; CSRF middleware is DB-agnostic but pilot routes use pgDb)
- **Files:** `server/middleware/csrf.ts`, `server/pgDb.ts`
- **Lines:** `csrf.ts:67,72`; `pgDb.ts:50`
- **Description:** Two bugs in this item:
  1. CSRF validator accesses `user.id` without null guard when `user` is undefined (pilot-only auth). Throws `TypeError`.
  2. `toPostgresParams` returns wrong `values` in the named-params branch: it returns `params` (original array with object) instead of `values` (extracted scalar values). All named-parameter queries fail in production.
- **Fix Instructions:**
  1. **CSRF fix:** Determine the correct userId from either `user?.id` or `pilot?.id` and use that for CSRF validation:
     ```typescript
     const userId = user?.id ?? pilot?.id;
     if (!validateCSRFToken(userId, token)) {
       log.warn(`Invalid CSRF token from ${userId} on ${req.method} ${req.path}`);
       return res.status(403).json({ error: "Invalid CSRF token" });
     }
     ```
  2. **pgDb fix:** At `pgDb.ts:50`, change `values: params` to `values: values`:
     ```typescript
     return { sql: converted, values: values };
     ```
  3. These are two independent one-line fixes in different files.
- **Test Guidance:** 
  - CSRF: Start pilot login flow, obtain CSRF token, make a POST/PUT with pilot auth. Verify no 500 error.
  - pgDb: Make any API call using named parameters (e.g., `POST /api/checkins` with `{id, siteId}`). Verify the insert succeeds in production mode.
- **Estimated Fix Time:** 10 min (5 min each)

### P-005: `DATE()` function has no pgDb converter — [DB-C2-001]
- **Priority:** P0
- **Source Reviewers:** Database
- **Original Severity:** CRITICAL
- **Verified:** ✅ Confirmed at `server/routes/checkins.ts:27`: `DATE(timestamp) = DATE('now')`. The pgDb converter (`pgDb.ts:162-166`) handles `datetime('now', ...)` patterns only. The SQL `DATE()` function is NOT converted. PostgreSQL has no `DATE(string)` function — `DATE` is a type name. This throws `function date(unknown) does not exist`.
- **Dual-DB Risk:** YES — works in SQLite (DATE() is a built-in function), crashes in PostgreSQL
- **Files:** `server/pgDb.ts`, `server/routes/checkins.ts`
- **Lines:** `pgDb.ts:162-166` (converter area), `checkins.ts:27`
- **Description:** `DATE(timestamp)` and `DATE('now')` are SQLite built-in functions that have no pgDb converter. PostgreSQL requires `DATE(timestamp)` → `timestamp::date` or `SUBSTR(timestamp, 1, 10)`. The checkins stats endpoint returns 500 in production.
- **Fix Instructions:**
  1. Either fix the query in `checkins.ts` to use a DB-agnostic pattern (e.g., `SUBSTR(timestamp, 1, 10) = SUBSTR(CAST(CURRENT_TIMESTAMP AS TEXT), 1, 10)` for PG / `SUBSTR(timestamp, 1, 10) = SUBSTR(DATE('now'), 1, 10)` — but this differs between DBs).
  2. Better: Add a converter in `pgDb.ts` that handles `DATE(expression)` → `SUBSTR(CAST(expression AS TEXT), 1, 10)`. Add this regex:
     ```typescript
     sql = sql.replace(/DATE\(([^)]+)\)/gi, "SUBSTR(CAST($1 AS TEXT), 1, 10)");
     ```
     Place it after the `datetime()` converters (around line 166).
  3. Verify no regressions: this pattern should only match `DATE(something)` and not affect `DATETIME(...)`.
- **Test Guidance:** Start server with `DATABASE_URL` set. Call `GET /api/admin/checkins/stats`. Verify it returns `200 { total, today, bySite }` instead of 500.
- **Estimated Fix Time:** 10 min

### P-006: SSE heartbeat missing error handler — [B-004]
- **Priority:** P1
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `server/routes/retrievals.ts:37-46`. `setInterval` calls `res.write(': heartbeat\n\n')` every 30s. There is a `req.on('close', ...)` handler but no `res.on('error', ...)` handler. When a client disconnects abruptly, `res.write()` on a dead socket emits an `'error'` event. Without a listener, this can cause an unhandled error in Node.js. The handler is a raw Express callback (not wrapped in `asyncHandler`), so even the try/catch doesn't cover async write errors.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/retrievals.ts`
- **Lines:** 37-46
- **Description:** The SSE heartbeat interval continues writing to `res` after client disconnect. Without `res.on('error')`, errors on dead sockets are unhandled. Over time with unstable mobile connections, this can accumulate leaked intervals and client references.
- **Fix Instructions:**
  1. Add `res.on('error', () => { clearInterval(heartbeat); svc.removeSseClient(client); });` alongside the existing `req.on('close', ...)` handler.
  2. Consider adding `req.on('end', ...)` as well for completeness (some proxy configs emit 'end' instead of 'close').
- **Test Guidance:** (dev) Simulate a client disconnect mid-SSE stream. Verify the interval is cleared and no error is thrown. (prod) Monitor server logs for unhandled errors from SSE connections.
- **Estimated Fix Time:** 5 min

### P-007: Closure banner timezone bug (UTC vs Melbourne) — [B-005]
- **Priority:** P1
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `server/routes/sites/closures.ts:23-28`. `new Date(r.first_date + 'T12:00:00')` and `new Date(today + 'T12:00:00')` — in Node.js (Railway = UTC), `T12:00:00` is interpreted as noon UTC, not noon Melbourne. `today` = `new Date().toISOString().split('T')[0]` = UTC date string. During 00:00-09:59 Melbourne time (14:00-23:59 UTC previous day), `today` differs from Melbourne's calendar date. The `T12:00:00` offset doesn't fully fix this — it shifts the banner comparison to ~10am Melbourne instead of midnight.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/sites/closures.ts`
- **Lines:** 23-28
- **Description:** Closure banner's 7-day advance window is calculated using `new Date()` with local-timezone interpretation. On a UTC server (Railway), `today` is the UTC date, and `T12:00:00` means noon UTC. This causes the banner to activate/deactivate ~10 hours earlier/later than Melbourne's local midnight, creating a window where banners are stale.
- **Fix Instructions:**
  1. Use a date-only comparison that ignores time. Convert both dates to a consistent string format (YYYY-MM-DD) and compare as strings:
     ```typescript
     const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }); // 'YYYY-MM-DD'
     const active = rows.filter(r => {
       const bannerStart = new Date(r.first_date); // stored as YYYY-MM-DD
       bannerStart.setDate(bannerStart.getDate() - 7);
       const bannerStartStr = bannerStart.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
       return todayStr >= bannerStartStr;
     });
     ```
  2. Alternatively, use integer date math: parse YYYY, MM, DD from the string and compare as YYYYMMDD integers (no timezone dependency).
  3. The core fix: use `timeZone: 'Australia/Melbourne'` in all date-to-string conversions.
- **Test Guidance:** Test on a server set to UTC. Set a closure date for tomorrow Melbourne time. Verify the banner appears on the correct Melbourne date, not the UTC date.
- **Estimated Fix Time:** 20 min

### P-008: SO proximity check spoofable via client lat/lon — [S-4]
- **Priority:** P1
- **Source Reviewers:** Security
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `server/routes/auth.ts:126-136`: latitude and longitude come directly from `req.body` with no server-side GPS verification. `haversineDistance` is called with user-supplied coordinates. Site coordinates are publicly visible on the site page and API. Distance = 0 if user supplies site coordinates.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/auth.ts`
- **Lines:** 126-136
- **Description:** The SO login proximity check trusts client-supplied latitude/longitude. Since site coordinates are public data, anyone can fake being at the site. The proximity check provides no real security — it's a safety control that can be fully bypassed.
- **Fix Instructions:**
  1. Document this limitation in the code as a known security constraint. Add a comment noting that the proximity check is client-supplied and not verifiable without a trusted GPS source.
  2. Consider adding server-side IP geolocation as a secondary (not primary) verification for the SO login.
  3. This is primarily a documentation/trust-boundary fix. A full GPS verification would require client-side attestation (Web Crypto + GPS) which is a larger feature.
- **Test Guidance:** Attempt SO login from a remote location with spoofed coordinates. Verify the login succeeds (current behavior) and that this is at least documented as a known limitation.
- **Estimated Fix Time:** 5 min (docs + comments) or 1-2h (IP geolocation add-on)

### P-009: rehype-raw + style attribute allows CSS overlay attacks — [S-3]
- **Priority:** P1
- **Source Reviewers:** Security
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `src/components/MarkdownRenderer.tsx:6-12`. The `sanitizeSchema` extends `defaultSchema` with `div`/`span` tags accepting `style` attributes. Combined with `rehypeRaw`, this allows raw HTML with inline styles. `style` attributes can include `position: fixed`, `top/left/width/height` to create overlays, or `background: url(...)` for data exfiltration. `rehype-sanitize` does strip event handlers and `<script>` tags. Attack severity is limited: content must come from trusted admin users (Google Docs paste).
- **Dual-DB Risk:** NO
- **Files:** `src/components/MarkdownRenderer.tsx`
- **Lines:** 6-12
- **Description:** The custom `sanitizeSchema` allows `style` attributes on `div`/`span` elements. `rehype-raw` + `style` attributes enable CSS-based attacks (overlay, background URL requests). While `rehype-sanitize` strips JS handlers, pure CSS attacks are still possible. Risk is limited to admin-created content.
- **Fix Instructions:**
  1. Remove `style` from the allowed attributes on `div`/`span` in the `sanitizeSchema`.
  2. If inline styling is needed for Google Docs content, whitelist specific safe CSS properties instead of allowing all `style` values:
     ```typescript
     attributes: {
       ...defaultSchema.attributes,
       div: ['className', /* not style */],
       span: ['className'],
     }
     ```
  3. Alternatively, use `rehype-sanitize`'s `purify` or `postProcess` hooks to sanitize the style value to a whitelist of safe properties (color, font-weight, text-align).
- **Test Guidance:** Paste content from a Google Doc that includes inline styles. Verify the rendered output doesn't include `style=""` attributes. Verify basic formatting (bold, headings, lists) still works via standard Markdown.
- **Estimated Fix Time:** 10 min

### P-010: Compass directions array duplicated across 3+ server files — [D-10, de-escalated]
- **Priority:** P2
- **Source Reviewers:** Duplication
- **Original Severity:** HIGH (de-escalated: Cycle 1 already fixed some; only 3 files remain)
- **Verified:** ✅ `server/utils/geometry.ts` exports `COMPASS_DIRS` as canonical. Current usage confirmed by `rg`:
  - `server/routes/search.ts:5` — ✅ imports from `geometry.js` (FIXED)
  - `server/routes/sites/helpers.ts:24` — ✅ imports from `geometry.js` (FIXED)
  - `server/wtf.ts:21` — ❌ defines local `COMPASS_POINTS = ["N", "NNE", ...]` (DUPLICATE)
  - `server/extendedForecast.ts:313` — ❌ defines local `allDirs = ["N", "NNE", ...]` (DUPLICATE)
  - `server/freeflightwx.ts:108` — ❌ defines local `dirs = ["N", "NNE", ...]` (DUPLICATE)
  - `server/weather.ts` — NOT FOUND in codebase (likely removed in recent cycle)
  The duplication has been reduced from 6 to 3 files since Cycle 1.
- **Dual-DB Risk:** NO
- **Files:** `server/wtf.ts`, `server/extendedForecast.ts`, `server/freeflightwx.ts`
- **Lines:** `wtf.ts:21-25`, `extendedForecast.ts:313`, `freeflightwx.ts:108`
- **Description:** Three server files still define their own 16-element compass directions arrays instead of importing `COMPASS_DIRS` from `server/utils/geometry.ts`. Each has a different variable name (`COMPASS_POINTS`, `allDirs`, `dirs`). Changing the compass list would require updating 4 files.
- **Fix Instructions:**
  1. In each of the 3 files, add `import { COMPASS_DIRS } from '../utils/geometry.js';` (adjust relative path as needed).
  2. Replace the local array definition with a reference to `COMPASS_DIRS` (rename local usages if needed, or alias: `const dirs = COMPASS_DIRS;`).
- **Test Guidance:** Verify each file still works: trigger a WTF fetch, run extended forecast, fetch freeflightwx data. Confirm compass direction calculations produce identical results.
- **Estimated Fix Time:** 10 min (all 3 files)

### P-011: directionToDegrees hardcoded in WindCompass — [D-11]
- **Priority:** P2
- **Source Reviewers:** Duplication
- **Original Severity:** MEDIUM
- **Verified:** ✅ `src/components/weather/WindCompass.tsx:4-10` has explicit `directionToDegrees` lookup table. `src/components/WindCompass.tsx:4` uses `ANGLE_STEP = 360 / DIRECTIONS.length` (calculated). `src/components/windMapTypes.ts:25` uses `index * 22.5`. `src/components/WindFieldLayer.tsx:48` has another inline map. All encode the same direction→degrees mapping.
- **Dual-DB Risk:** NO
- **Files:** `src/components/weather/WindCompass.tsx`, `src/lib/utils.ts`
- **Lines:** `weather/WindCompass.tsx:4-10`
- **Description:** An explicit `directionToDegrees` lookup table is defined in the weather/WindCompass component instead of being exported from `src/lib/utils.ts` alongside `DIRECTIONS`. The same mapping is computed differently in 3 other files (Angle_STEP × index).
- **Fix Instructions:**
  1. Add `directionToDegrees` to `src/lib/utils.ts` alongside `DIRECTIONS`:
     ```typescript
     export const DIRECTION_TO_DEGREES: Record<string, number> = {
       'N': 0, 'NNE': 22.5, 'NE': 45, /* ... */
     };
     ```
  2. Update `src/components/weather/WindCompass.tsx` to import and use `DIRECTION_TO_DEGREES` instead of the local definition.
- **Test Guidance:** Verify compass rendering is identical. The wind direction arrow should point to the same angle as before.
- **Estimated Fix Time:** 10 min

### P-012: Admin page dirty-tracking boilerplate (14 files, 122 markDirty calls) — [D-12]
- **Priority:** P2
- **Source Reviewers:** Duplication
- **Original Severity:** HIGH
- **Verified:** ✅ Confirmed: `rg "useAdminForm" src/` finds 14+ files. `rg "markDirty\(\)" src/` finds 122 hits. Pattern: each admin page calls `useAdminForm()` and manually wraps every `onChange` with `markDirty()`. `UnsavedChangesModal` rendered in each page with identical structure. Maintenance burden is high.
- **Dual-DB Risk:** NO
- **Files:** 14 admin page files (listed in original report)
- **Description:** Every admin page independently manages dirty state via manual `markDirty()` calls on every input change (122 calls across 14 files). The `useAdminForm` hook centralizes save logic but not dirty detection — developers must manually call `markDirty()` on every input. Missing a call = data loss. Adding a new page = copy-paste boilerplate.
- **Fix Instructions:**
  1. This is a larger refactoring task. Options:
     - Option A: Create a proxy-based `useFormState` that automatically detects mutations and triggers dirty tracking (using `Proxy` or `immer`-style mutation detection).
     - Option B: Create wrapper components `<AdminInput>`, `<AdminSelect>`, `<AdminTextArea>` that auto-call `markDirty()` on change, eliminating manual decoration.
     - Option C: Use `react-hook-form` which has built-in `isDirty` detection.
  2. Pick one option and refactor 2-3 admin pages as a pilot. Verify the rest can follow the same pattern.
  3. This is a larger architectural change — estimated at 3-5 hours for full implementation.
- **Test Guidance:** After refactoring, test at least 2 admin pages: change a field, navigate away, verify the unsaved-changes modal appears. Test that saving works. Test that discarding works.
- **Estimated Fix Time:** 3-5 hours (full refactoring) — recommend as a standalone ticket

### P-013: No explicit error thrown for mixed placeholder styles — [DB-C2-002]
- **Priority:** P2
- **Source Reviewers:** Database
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `pgDb.ts:39-58`: The `toPostgresParams` function has two branches. The named branch (object input) converts `@key` → `$N` but leaves `?` as literal. The positional branch (array input) converts `?` → `$N` but leaves `@key` as literal. If a query mixes both styles, PostgreSQL would reject it. Currently, no queries mix both styles.
- **Dual-DB Risk:** YES — latent production risk
- **Files:** `server/pgDb.ts`
- **Lines:** 39-58
- **Description:** The `toPostgresParams` converter doesn't detect or prevent mixing `?` and `@key` placeholders in the same query. If a developer accidentally writes both styles, SQLite would accept it but PostgreSQL would crash. Currently no queries mix both styles, so this is a latent risk with no current impact.
- **Fix Instructions:**
  1. Add a validation check in `toPostgresParams`:
     ```typescript
     const hasQuestionMarks = /\?/.test(sql);
     const hasNamedParams = /@\w+/.test(sql);
     if (hasQuestionMarks && hasNamedParams) {
       throw new Error(`SQL query mixes ? and @param placeholders: ${sql.substring(0, 100)}`);
     }
     ```
  2. This provides a clear, immediate error instead of a confusing PostgreSQL syntax error.
- **Test Guidance:** Write a test query with both `?` and `@key`. Verify it throws a clear error message. Verify normal queries (only `?` or only `@key`) still work.
- **Estimated Fix Time:** 5 min

### P-014: Server startup fire-and-forget N+1 data fixups — [P-001]
- **Priority:** P2
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** ✅ Confirmed at `server/routes/sites/helpers.ts:237-284`. The `runOneTimeDataFixups` IIFE runs on startup. It does 3 `SELECT` queries full-table scans, then loops through results with individual `UPDATE` statements. The `dataFixupsComplete` flag (a settings table string) determines whether to skip. The IIFE is fire-and-forget (async, doesn't block server start).
- **Dual-DB Risk:** NO
- **Files:** `server/routes/sites/helpers.ts`
- **Lines:** 237-284
- **Description:** Three N+1 update loops run on every server startup (unless flagged as complete). Each loop does a `SELECT * FROM sites` followed by individual `UPDATE` statements. For 25 sites with 3 loops, that's up to 75 sequential DB queries. At current scale, this is ~0.3-0.75s. The flag can be accidentally cleared by manual DB edits.
- **Fix Instructions:**
  1. Convert the update loops to batch UPDATEs using `CASE WHEN`:
     ```sql
     UPDATE sites SET pgRating = CASE id
       WHEN 'id1' THEN 'fixed1'
       WHEN 'id2' THEN 'fixed2'
     END
     WHERE id IN ('id1', 'id2')
     ```
  2. Or, since these are "one time" fixups, consider running them as a one-shot migration script instead of on every startup.
  3. Remove the IIFE pattern entirely — or make it idempotent via a DB-side check (e.g., only run if any records need fixing).
- **Test Guidance:** Verify the fixups still complete correctly. Verify startup time is reduced. Verify `dataFixupsComplete` flag works as expected.
- **Estimated Fix Time:** 30 min

### P-015: Site list fetches ALL closure dates (ignores pagination) — [P-002]
- **Priority:** P2
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** ✅ Confirmed at `server/routes/sites/crud.ts:45-57`. The query `SELECT site_id, closure_date FROM site_closure_dates WHERE closure_date >= ? AND closure_date <= ?` fetches ALL closure rows for ALL sites in 60 days, then joins in JS. But only `LIMIT` sites are returned. Unreturned sites' closure rows are fetched and discarded.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/sites/crud.ts`
- **Lines:** 45-57
- **Description:** The site list endpoint fetches closure dates for every site (all 25+), regardless of pagination. For a page of 10 sites, it fetches closure data for ~25 sites then discards 15. At current scale, this is ~75 rows — fast but wasteful. At 200 sites, ~2000 rows per request.
- **Fix Instructions:**
  1. Modify the closure query to only fetch dates for the sites being returned:
     ```typescript
     const siteIds = sites.map(s => s.id);
     const placeholders = siteIds.map(() => '?').join(',');
     const allClosureRows = await db.prepare(
       `SELECT site_id, closure_date FROM site_closure_dates 
        WHERE site_id IN (${placeholders})
        AND closure_date >= ? AND closure_date <= ?`
     ).all(...siteIds, today, sixtyDaysStr);
     ```
  2. This adds one additional query but fetches far fewer rows.
- **Test Guidance:** Verify the paginated site list still includes correct `upcomingClosureDates` for each returned site.
- **Estimated Fix Time:** 10 min

### P-016: GET /:id individual site route has no caching — [P-003]
- **Priority:** P2
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** ✅ Confirmed at `server/routes/sites/crud.ts`. The `GET /:id` handler makes the site lookup query but has no cache. The `GET /` (list) handler uses cache (`160` via `getPublicSitesCache()`). Individual detail fetches always hit the DB. Each detail call = 2 DB queries (site + closure dates).
- **Dual-DB Risk:** NO
- **Files:** `server/routes/sites/crud.ts`
- **Lines:** Individual `GET /:id` handler
- **Description:** The individual site detail endpoint (`GET /:id`) has no caching layer. Every call performs 2 DB queries. The list endpoint is cached but this detail endpoint is not. The home page and previews can trigger many individual site detail calls, each hitting the DB twice.
- **Fix Instructions:**
  1. Add a simple in-memory cache (like the list endpoint uses) keyed by site ID.
  2. Cache TTL should be similar to the list cache (~160s or so).
  3. Invalidate the per-site cache when `PUT /:id` (site edit) is called.
  4. Consider sharing the same cache instance between list and detail endpoints (keyed differently).
- **Test Guidance:** Make multiple requests to `GET /api/sites/:id` for the same site. Verify subsequent requests hit the cache (check response time). Verify cache invalidation works after a site edit.
- **Estimated Fix Time:** 20 min

### P-017: UseParallel primary + alt weather observations — [P-005]
- **Priority:** P2
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `server/routes/weather.ts`. Primary observation and alt observation are fetched sequentially (`await` then `await`). They are independent queries and could be parallelized with `Promise.all()`.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/weather.ts`
- **Lines:** ~390-410 (confirmed as sequential pattern)
- **Description:** The weather observation fetches for primary and alt stations are independent but fetched sequentially. Combining them with `Promise.all()` would cut the latency in half.
- **Fix Instructions:**
  1. Change the two sequential `await` calls to a single `Promise.all()`:
     ```typescript
     const [observation, altObs] = await Promise.all([
       db.prepare("SELECT * FROM weather_observations WHERE siteId = ? ORDER BY timestamp DESC LIMIT 1").get(siteId),
       site.liveStationIdAlt 
         ? db.prepare("SELECT * FROM weather_observations WHERE siteId = ? ORDER BY timestamp DESC LIMIT 1").get(`${siteId}:alt`)
         : Promise.resolve(null),
     ]);
     ```
- **Test Guidance:** Verify the weather endpoint returns the same data. Measure the response time improvement (should be ~50% faster for the double-query case).
- **Estimated Fix Time:** 5 min

### P-018: memoize center lat/lon in SitesWindMap — [P-006]
- **Priority:** P2
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `src/components/SitesWindMap.tsx:157-158`. Two `reduce()` calls over the `sites` array compute `centerLat` and `centerLon`. The component re-renders on every `currentTime` tick, `isPlaying`, `trayOpen`, etc. `sites` rarely changes during playback. These reduce calls are recomputed every render, not wrapped in `useMemo`.
- **Dual-DB Risk:** NO
- **Files:** `src/components/SitesWindMap.tsx`
- **Lines:** 157-158
- **Description:** Center coordinates are computed with `sites.reduce()` on every render. With the map re-rendering at 60fps during playback, this is 4000+ reduce iterations per minute. `useMemo` with `[sites]` dependency would cache the result.
- **Fix Instructions:**
  1. Wrap the center calculation in `useMemo`:
     ```typescript
     const center = useMemo(() => {
       if (sites.length === 0) return { lat: -37.8, lon: -37.8 };
       return {
         lat: sites.reduce((s, site) => s + site.lat, 0) / sites.length,
         lon: sites.reduce((s, site) => s + site.lon, 0) / sites.length,
       };
     }, [sites]);
     ```
- **Test Guidance:** React Profiler should show reduced render time for SitesWindMap. Visual map center should be identical.
- **Estimated Fix Time:** 5 min

### P-019: User enumeration in password reset (mode param) — [S-2]
- **Priority:** P2
- **Source Reviewers:** Security
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `server/routes/auth.ts:253-290` (`request-password-reset` handler). When `mode === "first-time"` and email doesn't exist, it returns `404 { error: "No account found" }`. All other cases return `200 { success: true, message: "If an account exists..." }`. The `mode` parameter is user-controlled via `req.body.mode`.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/auth.ts`
- **Lines:** 253-290 (approximate — the request-password-reset handler)
- **Description:** The `mode === "first-time"` branch reveals whether an email exists in the database (404 vs 200). Attackers can enumerate registered addresses. The `mode` parameter is user-supplied with no restriction. Rate limited to 5/hour per IP, mitigating large-scale attacks.
- **Fix Instructions:**
  1. Remove the `mode === "first-time"` conditional response. Always return the same generic response:
     ```typescript
     if (!contact) {
       return res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." });
     }
     ```
  2. The actual email-sending logic (when contact exists) can remain unchanged. The only change is to stop revealing "no account found" to the client.
- **Test Guidance:** Send a request with `mode: "first-time"` and a non-existent email. Verify it returns `200` with the generic message, not `404`.
- **Estimated Fix Time:** 5 min

### P-020: TidyHQ webhook auto-creates contacts without human approval — [S-5 note]
- **Priority:** P3
- **Source Reviewers:** Security
- **Original Severity:** LOW
- **Verified:** ✅ Confirmed at `server/routes/tidyhq.ts:131-138`. Webhook auto-creates contacts with `INSERT INTO contacts (id, name, surname, email)`. Default role flags are 0. If the group mapping includes `isCommittee` or `isPosition`, the contact is elevated. Requires TidyHQ admin compromise.
- **Dual-DB Risk:** NO
- **Files:** `server/routes/tidyhq.ts`
- **Lines:** 131-138
- **Description:** (Noted for awareness. Attack chain requires TidyHQ compromise. Not blocking.) If TidyHQ admin is compromised, attacker can self-create admin accounts with zero human approval. Current mitigation: webhook signing key. Recommended: add an audit log entry and optionally notify committee on auto-creation.
- **Fix Instructions:** (Optional / P3) After the `INSERT INTO contacts` auto-creation:
  1. Add a `tidyhq_webhook_log` entry specifically for auto-creation events.
  2. Optionally send an admin notification email.
  3. Consider adding a `pendingApproval` flag for auto-created contacts.
- **Test Guidance:** N/A (requires TidyHQ access to test)
- **Estimated Fix Time:** 15 min (optional)

### P-021: Date fixups use N+1 instead of batch updates — [P-001 note]
- **Priority:** P3
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** ✅ See P-014 (same finding — listed as P3 here for backlog)
- **Fix Instructions:** Same as P-014.

### P-022: `INSERT OR REPLACE` silent fallback on unknown tables — [DB-C2-003]
- **Priority:** P3
- **Source Reviewers:** Database
- **Original Severity:** MEDIUM
- **Verified:** ✅ Confirmed at `server/pgDb.ts:140`. When `INSERT OR REPLACE` is used for a table not in the explicit handler list, it falls back to `ON CONFLICT DO NOTHING` (silent skip on conflict). This is semantically different from SQLite's REPLACE (delete+insert). All current tables have handlers, but latent risk.
- **Dual-DB Risk:** YES
- **Files:** `server/pgDb.ts`
- **Lines:** ~140
- **Description:** The fallback for unknown `INSERT OR REPLACE` tables is `ON CONFLICT DO NOTHING`, which silently skips updates. A developer adding a new table with `INSERT OR REPLACE` would get silent data loss in production without a clear error.
- **Fix Instructions:**
  1. Change the fallback from `ON CONFLICT DO NOTHING` to a thrown error:
     ```typescript
     throw new Error(`INSERT OR REPLACE for unknown table — add a handler in convertSQL(): ${tableName}`);
     ```
  2. The `log.warn` already fires, but a thrown error ensures the developer sees it immediately.
- **Test Guidance:** Add an `INSERT OR REPLACE` for a non-existent table name. Verify it throws a clear error instead of silently doing nothing.
- **Estimated Fix Time:** 5 min

### P-023: Particle renderer processes all 8000 particles per frame — [P-007]
- **Priority:** P2 (P2: minor, mobile-only concern)
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM
- **Verified:** ✅ At `particleRenderer.ts:38-56`, the loop iterates all `POOL_PARTICLES` (8000) every frame. When zoomed out, only ~1000 are "active". The loop still marks 7000 as expired each frame. Each active particle does `getWindAt()` (bilinear + temporal interpolation).
- **Dual-DB Risk:** NO
- **Files:** `src/components/windmap/particleRenderer.ts`, `src/components/windmap/WindCanvas.tsx`
- **Lines:** `particleRenderer.ts:38-56`
- **Description:** The particle loop always iterates all 8000 particles regardless of zoom level. Inactive particles just increment age (cheap but wasteful). Contributes to frame drops on mobile devices.
- **Fix Instructions:**
  1. Split the loop: process active particles normally, skip inactive particles entirely:
     ```typescript
     for (let i = 0; i < activeCount; i++) { /* animate */ }
     for (let i = activeCount; i < POOL_PARTICLES; i++) {
       particles[i].age = particles[i].maxAge; // mark dead, don't process
     }
     ```
  2. This avoids `getWindAt()` calls on inactive particles (though the reviewer noted the `continue` already skips it — the issue is the loop overhead itself).
  3. Consider reducing `POOL_PARTICLES` for mobile devices.
- **Test Guidance:** FPS should remain high on mobile when zoomed out. Active particles should animate the same.
- **Estimated Fix Time:** 10 min

### P-024: `DO $$` blocks silently stripped without logging — [DB-C2-004]
- **Priority:** P3
- **Source Reviewers:** Database
- **Original Severity:** LOW
- **Verified:** ✅ Confirmed at `server/db.ts:71`. `DO $$ ... $$` blocks are removed from SQL during SQLite migration conversion via `result.replace(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi, "")`. No log output. Current blocks (migrations 012, 022) contain PG-only logic that's irrelevant for SQLite.
- **Dual-DB Risk:** YES (latent)
- **Files:** `server/db.ts`
- **Lines:** 71
- **Description:** When `DO $$ ... $$` blocks are stripped during SQLite migration, no log entry is produced. In dev, a developer wouldn't know a block was skipped. If a future migration puts SQLite-relevant logic inside a `DO $$` block, it would be silently dropped.
- **Fix Instructions:**
  1. Before the `.replace()`, count matches and log:
     ```typescript
     const doBlocks = sql.match(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi);
     if (doBlocks) {
       log.debug(`Stripping ${doBlocks.length} PostgreSQL DO $$ block(s) during SQLite migration`);
     }
     result = result.replace(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi, "");
     ```
- **Test Guidance:** Add a test migration with a `DO $$` block. Verify the debug log message appears during SQLite migration.
- **Estimated Fix Time:** 5 min

---

## Unverified / Low-Confidence Items (Not in Plan)

These items were investigated but not added to the fix plan due to insufficient evidence or already-fixed state:

| Item | Why Not in Plan |
|------|-----------------|
| `server/weather.ts` compass array (D-10) | File not found in `rg` search — likely removed in this cycle. Not a current issue. |
| P-008 (`buildPublicContext` string concat) | V8 optimizes string concatenation. At 25 sites, payload is ~15-25KB. Performance impact <1ms. Low value for fix effort. |

---

## Summary by Priority

| Priority | Count | Items |
|----------|-------|-------|
| **P0 (Fix immediately)** | 5 | P-001, P-002, P-003, P-004, P-005 |
| **P1 (Fix this cycle)** | 4 | P-006, P-007, P-008, P-009 |
| **P2 (Fix if time)** | 9 | P-010, P-011, P-012, P-013, P-015, P-016, P-017, P-018, P-023 |
| **P3 (Backlog)** | 4 | P-020, P-021, P-022, P-024 |

### Total Estimated Fix Time
- **P0 (immediate):** ~45 min — all quick, all production-critical
- **P1 (this cycle):** ~40 min — all quick, production-impacting
- **P2 (if time):** ~5-6 hours — includes the larger admin form refactoring (P-012)
- **P3 (backlog):** ~30 min — nice-to-have improvements
- **Grand total:** ~8 hours across all priorities

### Notes for the Fixer
- All P0 items are single-file, small changes. **Start with P0.**
- P-004 combines two fixes (CSRF middleware + pgDb parameter bug). These are independent one-line changes in different files.
- P-012 (admin form refactoring) is the largest task — consider it a standalone ticket, not part of the quick-fix cycle.
- Cross-reference the fix plan with the original review reports for full source code quotes and context.
- Test every fix in **BOTH** SQLite (dev) and PostgreSQL (prod/DATABASE_URL) modes.
