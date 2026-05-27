# Bug Review — Cycle 2
**Date:** 2026-05-23
**Reviewer:** Bugs & Logic Errors Agent

## Summary
- Total findings: 5
- CRITICAL: 1
- HIGH: 1
- MEDIUM: 3
- LOW: 0

---

## Finding B-001: `datetime('now', '-10 hours', 'start of day')` converts to `(CURRENT_TIMESTAMP - interval '10 hours')::date` — DATE compared to TEXT causes runtime error in PostgreSQL
- **Severity:** CRITICAL
- **File(s):** `server/services/realRetrievalService.ts`, line 12 (constant), used at lines 129, 205, 213, 449, 472, 477
- **Lines:** 12
- **Code:**
  ```typescript
  const TODAY_SCOPE = "AND createdAt >= datetime('now', '-10 hours', 'start of day')";
  // Used in every retrieval query, e.g.:
  `SELECT pilotId, pilotLat, pilotLon, claimedAt FROM retrievals WHERE driverId = ? AND status = 'claimed' AND pilotLat IS NOT NULL AND pilotLon IS NOT NULL ${TODAY_SCOPE} ORDER BY claimedAt ASC`
  ```
- **Bug:** pgDb's `convertSQL()` (line 149) has the regex:
  ```
  /datetime\('now',\s*'-(\d+)\s+hours?',\s*'start of day'\)/gi
  ```
  This matches `datetime('now', '-10 hours', 'start of day')` and replaces it with:
  ```
  (CURRENT_TIMESTAMP - interval '$1 hours')::date
  ```
  The `CURRENT_TIMESTAMP` in PostgreSQL is the server's wall-clock time (UTC on Railway). `::date` casts to PostgreSQL's `date` type (no time component). The `createdAt` column stores TEXT in ISO 8601 format (`"2026-05-23T14:30:00.123Z"`).

  In Python, `text` type. `"2026-05-23T14:30:00.123Z"` contains `T` and `Z`. PostgreSQL will attempt to cast the TEXT to DATE to perform the comparison. The ISO 8601 format with `Z` timezone designator **is not a valid PostgreSQL date literal**. PG throws:
  ```
  ERROR: invalid input syntax for type date: "2026-05-23T14:30:00.123Z"
  ```
  In SQLite, `datetime('now', '-10 hours', 'start of day')` returns a text like `"2026-05-13T04:00:00"`. TEXT >= TEXT works. But on PostgreSQL, the `::date` cast produces a DATE type, and DATE >= TEXT fails.
- **Impact:** Every retrievals query using `TODAY_SCOPE` crashes in production. This affects: retrieval status checks, driver ETA calculations, flight end handling, SSE broadcasts. The entire retrieval system is **broken in production**.
- **Confidence:** HIGH — Regex matches. `::date` cast produces DATE. TEXT >= DATE with ISO 8601 strings fails in PostgreSQL. Production-breaking error.

---

## Finding B-002: Settings GET handler doesn't await pgDb `.get()` calls — grid timestamps silently missing in production
- **Severity:** HIGH
- **File(s):** `server/routes/settings.ts`, lines 20, 23, 26
- **Lines:** 20, 23, 26
- **Code:**
  ```typescript
  const fineRow = db.prepare("SELECT MAX(updatedAt) as ts FROM wind_grid_data WHERE siteId LIKE 'fine_grid_%'").get() as { ts: string | null };
  if (fineRow?.ts) result.fineGridLastRun = new Date(fineRow.ts + 'Z').toISOString();

  const coarseRow = db.prepare("SELECT MAX(updatedAt) as ts FROM wind_grid_data WHERE siteId LIKE 'coarse_grid_%'").get() as { ts: string | null };
  if (coarseRow?.ts) result.coarseGridLastRun = new Date(coarseRow.ts + 'Z').toISOString();

  const extRow = db.prepare("SELECT MAX(computedAt) as ts FROM extended_wind_grids").get() as { ts: string | null };
  if (extRow?.ts) result.extendedForecastLastRun = extRow.ts;
  ```
- **Bug:** These three `db.prepare(...).get()` calls are NOT awaited. In SQLite, `.get()` is synchronous. In PostgreSQL, `.get()` is **async** and returns `Promise<any>`. No `await`, `fineRow`, `coarseRow`, `extRow` are **Promise objects**. `Promise.ts` is `undefined`, so `fineRow?.ts` fails and all three grid timestamp fields are never set. `new Date(Promise + 'Z')` would produce `Invalid Date` if the check passed, but the check fails first.
- **Impact:** Production settings endpoint never returns `fineGridLastRun`, `coarseGridLastRun`, or `extendedForecastLastRun`. The UI shows missing/undefined grid timestamps on the Settings page. Dev (SQLite) works fine.
- **Confidence:** HIGH — I verified pgDb `.get()` returns a promise. The handler doesn't await it. Silent failure in production.

---

## Finding B-003: `realFlightService.ts` queries `pilot_sessions` for `firstName`, `lastName` — columns don't exist
- **Severity:** MEDIUM
- **File(s):** `server/services/realFlightService.ts`, lines 107-110
- **Lines:** 107-110
- **Code:**
  ```typescript
  let pilotName = pilot?.firstName || pilot?.name || "Pilot";
  if (flight.pilotId && flight.pilotId !== pilot?.id) {
    const session = await db.prepare("SELECT firstName, lastName FROM pilot_sessions WHERE pilotId = ? ORDER BY createdAt DESC LIMIT 1").get(flight.pilotId) as any;
    if (session?.firstName) pilotName = session.firstName;
  }
  ```
- **Bug:** The `pilot_sessions` table has columns: `id`, `token`, `pilotId`, `createdAt`. It does NOT have `firstName` or `lastName`. These columns are on the `pilots` table. The query returns `undefined` for both. `session?.firstName` is `undefined`, so the fallback `"Pilot"` is used instead of the actual pilot's first name. This affects the cross-session flight end lookup (guest pilots with a session token).
- **Impact:** Retrieval system shows "Pilot" instead of the proper name when a guest ends their flight from a different session. Cosmetic but confusing for drivers.
- **Confidence:** HIGH — Schema verified against `008_add_pilot_sessions.sql`: columns are `id`, `token`, `pilotId`, `createdAt`.

---

## Finding B-004: SSE heartbeat in `retrievals.ts` has no error handler — dead client connections leak intervals and SSE clients
- **Severity:** MEDIUM
- **File(s):** `server/routes/retrievals.ts`, lines 25-40
- **Lines:** 25-40
- **Code:**
  ```typescript
  router.get("/events", requireAuth, (req: any, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('data: {"type":"connected"}\n\n');

    const client = { res, pilotId, role };
    svc.addSseClient(client);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      svc.removeSseClient(client);
    });
  });
  ```
- **Bug:** When the client disconnects (crashes, network drop), `req.on('close')` may not fire immediately on some proxy configurations (especially behind Railway or Cloudflare). The heartbeat interval keeps running, calling `res.write()` on a dead socket. The `res.write()` call throws silently (error is emitted on `res` but nobody listens). The interval never clears. Each dead connection leaks a 30-second timer + SSE client reference. Over time, this can accumulate significant memory and CPU.
- **Impact:** Dead SSE clients leak intervals and client objects. On mobile/unstable networks (common in retrieval scenarios), this can accumulate. Gradual resource exhaustion over time.
- **Confidence:** MEDIUM — Missing `res.on('error')` listener is the standard fix. Impact proportional to client disconnect frequency.

---

## Finding B-005: Closure banner filter uses UTC timezone-dependent date parsing — banner appears a day early on Melbourne time
- **Severity:** MEDIUM
- **File(s):** `server/routes/sites/closures.ts`, lines 23-28
- **Lines:** 23-28
- **Code:**
  ```typescript
  const active = rows.filter(r => {
    const first = new Date(r.first_date + 'T12:00:00');
    const bannerStart = new Date(first);
    bannerStart.setDate(first.getDate() - 7);
    return new Date(today + 'T12:00:00') >= bannerStart;
  });
  ```
- **Bug:** `new Date("2026-05-30T12:00:00")` in Node.js is interpreted in **local system timezone**. On Railway (UTC), this is 12:00 UTC. But `today` comes from `new Date().toISOString().split('T')[0]`. In Melbourne (UTC+10), the calendar date changes at 10am Melbourne time (00:00 UTC). During 12am-9:59am Melbourne time, `today` is **yesterday's UTC date**. The banner filter compares UTC-based dates, so during those hours, a closure starting "today" in Melbourne isn't matched — the banner doesn't show until 10am.
- **Impact:** Closure banners may not appear until 10am Melbourne time (UTC midnight). On any given Melbourne calendar day, the banner is late starting at 10am instead of midnight. Also, the date comparison logic uses `Date` objects with ambiguous timezone handling — could be off by a day on either side depending on server time.
- **Confidence:** MEDIUM — The timezone math is demonstrably wrong but intermittent. The actual impact is a 10-hour window daily where banners may be stale.

---

## Anti-Hallucination Checklist
- ✅ B-001: I read the actual code in `realRetrievalService.ts` and `pgDb.ts`. I quoted the exact regex and replacement. I verified the `::date` type mismatch with TEXT columns.
- ✅ B-002: I read `settings.ts` lines 20, 23, 26. I verified pgDb `.get()` is async. No await. Promise objects returned.
- ✅ B-003: I read `realFlightService.ts` lines 107-110. I checked migration `008_add_pilot_sessions.sql` — no `firstName`/`lastName` columns.
- ✅ B-004: I read `retrievals.ts` lines 25-40. `res.write()` in heartbeat has no error handler. Standard SSE leak pattern.
- ✅ B-005: I read `closures.ts` lines 23-28. `new Date("...T12:00:00")` uses local timezone. Railway is UTC. Melbourne is UTC+10. Calendar dates diverge for 10 hours daily.

All findings passed the anti-hallucination checklist.
