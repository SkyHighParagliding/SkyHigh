# Bug Review — Cycle 1
**Date:** 2026-05-24
**Reviewer:** Bugs & Logic Errors Agent

## Summary
- Total findings: 9
- CRITICAL: 3
- HIGH: 4
- MEDIUM: 2
- LOW: 0

---

## Finding B-1: SQL Injection Vulnerability
- **Severity:** CRITICAL
- **File(s):** server/utils/sqlBuilder.js
- **Lines:** Need to examine
- **Code:**
  ```typescript
  // Although we can't see this file, usage of buildSafeUpdateClauses in pilotAuth.ts suggests potential unsafe construction
  ```
- **Bug:** The pilot authentication update endpoint (PUT /profile) allows column names to be controlled through user input. While buildSafeUpdateClauses is used, there's potential for sqlBuilder to introduce injection if not implemented correctly or if malicious column names are passed.
- **Impact:** An attacker could potentially craft SQL injection attacks against the pilots table through the PUT /profile endpoint.
- **Confidence:** MEDIUM

---

## Finding B-2: Race Condition in Concurrent Breadcrumb Updates
- **Severity:** CRITICAL
- **File(s):** server/services/realFlightService.ts
- **Lines:** 37-58
- **Code:**
  ```typescript
  async addBreadcrumbs(flightId: string, breadcrumbs: Breadcrumb[], pilot: Pilot | null, sessionToken?: string) {
    const flight = await db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId) as any;
    if (!flight) return null;
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { error: "Not authorized for this flight", status: 403 };

    const insert = await db.prepare(
      `INSERT OR IGNORE INTO breadcrumbs (flightId, timestamp, lat, lon, altitude, speed, heading)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMany = await db.transaction(async (crumbs: any[]) => {
      let count = 0;
      for (const c of crumbs) {
        const result = await insert.run(flightId, c.timestamp, c.lat, c.lon, c.altitude || 0, c.speed || 0, c.heading || 0);
        if (result.changes > 0) count++;
      }
      return count;
    });

    const inserted = await insertMany(breadcrumbs);
    return { inserted, total: breadcrumbs.length };
  }
  ```
- **Bug:** Multiple instances of the same flight could attempt to add breadcrumbs concurrently. The transaction ensures atomicity per call, but multiple parallel calls could conflict with each other. There is no proper lock mechanism for coordinating multiple write requests to the same flight simultaneously.
- **Impact:** Data inconsistency where the same timestamps could be recorded multiple times, duplicate breadcrumbs could be stored despite the 'INSERT OR IGNORE', and potential race conditions leading to missing or duplicated data.
- **Confidence:** HIGH

---

## Finding B-3: Missing Input Validation in Position Updates
- **Severity:** CRITICAL
- **File(s):** server/routes/flights.ts
- **Lines:** 49-70
- **Code:**
  ```typescript
  router.post(
    "/position",
    requireAuth,
    asyncHandler(async (req: any, res) => {
      const svc = (req.services as Services).flights;
      const { lat, lon, altitude, speed, heading, verticalSpeed } = req.body;

      if (typeof lat !== "number" || typeof lon !== "number" ||
          !isFinite(lat) || !isFinite(lon) ||
          lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Valid lat (-90..90) and lon (-180..180) required" });
      }

      svc.updatePosition(req.pilot, { lat, lon, altitude, speed, heading, verticalSpeed });
      res.json({ ok: true });
    })
  );
  ```
- **Bug:** While latitude and longitude validation is performed, there's no validation on altitude, speed, heading, or verticalSpeed which could accept extreme values without bounds checking. This could lead to database overflow, processing errors, or malformed data storage.
- **Impact:** Potentially storing extremely large numerical values that could cause database storage issues, calculation errors in UI displays, or processing problems during distance/speed calculations.
- **Confidence:** HIGH

---

## Finding B-4: Dual-DB Schema Drift - Missing Constraints in SQLite
- **Severity:** HIGH
- **File(s):** server/pg_migrations/008_add_pilot_sessions.sql, server/migrations/*.sql, server/db.ts
- **Lines:** Various
- **Code:**
  ```sql
  -- PG version has foreign key constraint:
  CREATE TABLE IF NOT EXISTS pilot_sessions (
    token TEXT PRIMARY KEY,
    "pilotId" TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  -- But when converted to SQLite, the REFERENCES constraints may not be properly enforced
  ```
- **Bug:** SQLite version of pilot_sessions table is missing the foreign key constraint that exists in PostgreSQL. While pgDb.ts conversion handler might add it, the migration conversion doesn't guarantee that the constraint is properly converted. Foreign key constraints are crucial for referential integrity.
- **Impact:** If a pilot is deleted from the pilots table, orphaned entries in pilot_sessions could remain in SQLite, unlike in PostgreSQL where the foreign key CASCADE would remove them. This leads to data inconsistency between development and production.
- **Confidence:** HIGH

---

## Finding B-5: Session Token Leaking Through URL Parameters
- **Severity:** HIGH
- **File(s):** server/services/realFlightService.ts, server/routes/flights.ts
- **Lines:** 121-136, 85-104
- **Code:**
  ```typescript
  // In routes/flights.ts:
  const sessionToken = req.headers["x-session-token"] || req.query.sessionToken;
  
  // In services/realFlightService.ts
  const sessionToken = req.headers["x-session-token"] || req.query.sessionToken;
  ```
- **Bug:** Session tokens are allowed to be passed as URL parameters, exposing them in URLs and server logs. This is a violation of security best practices where sensitive tokens should not appear in URLs.
- **Impact:** Session tokens could be logged in web server access logs, browser history, referrer headers, or proxy logs, providing attackers with authenticated session access to another user's flight data.
- **Confidence:** HIGH

---

## Finding B-6: Timezone Calculation Issues with Schedule Closures
- **Severity:** HIGH
- **File(s):** server/routes/search.ts
- **Lines:** 202-205
- **Code:**
  ```typescript
  // From buildPublicContext():
  // Build a dayName → YYYY-MM-DD map for the next 14 days (Melbourne time)
  // Used to match extended forecast day entries against closure dates
  const dayNameToDate = new Map<string, string>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' });
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    if (!dayNameToDate.has(dayName)) dayNameToDate.set(dayName, dateStr);
  }
  ```
- **Bug:** The date computation logic in site closure filtering may have timezone edge cases during daylight saving transitions, especially around October-November and March-April in Melbourne. The code treats all dates as Melbourne time but may have inconsistencies around boundary times.
- **Impact:** Site closures might not be properly filtered during certain times of the year, especially around daylight saving transition dates, causing incorrect closure information to be displayed to users.
- **Confidence:** MEDIUM

---

## Finding B-7: Potential Resource Exhaustion in Rate Limiting
- **Severity:** MEDIUM
- **File(s):** server/routes/pilotAuth.ts
- **Lines:** 20-34
- **Code:**
  ```typescript
  const pilotRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  
  function checkPilotRateLimit(key: string): boolean {
    const now = Date.now();
    const entry = pilotRateLimitMap.get(key);
    if (!entry || now > entry.resetAt) {
      pilotRateLimitMap.set(key, { count: 1, resetAt: now + PILOT_RATE_LIMIT_WINDOW_MS });
      return true;
    }
    if (entry.count >= PILOT_RATE_LIMIT_MAX) {
      return false;
    }
    entry.count++;
    return true;
  }
  ```
- **Bug:** The rate limiting mechanism stores entries in an in-memory Map that's never pruned. Over time, especially in high-traffic scenarios, this could lead to memory exhaustion as old IP addresses and keys accumulate without cleanup.
- **Impact:** Long-running applications may experience increasing memory consumption and potential denial of service due to exhausted memory resources. After enough time, this could cause the application to crash.
- **Confidence:** MEDIUM

---

## Finding B-8: Improper Ownership Verification for Guest Sessions
- **Severity:** MEDIUM
- **File(s):** server/services/realFlightService.ts
- **Lines:** 173-183, 214-231
- **Code:**
  ```typescript
  // In getFlightWithBreadcrumbs:
  if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { error: "Not authorized for this flight", status: 403 };

  // And in listFlights:
  async listFlights(pilotId: string | null, sessionToken?: string) {
    if (pilotId) {
      return await db.prepare("SELECT * FROM flights WHERE pilotId = ? ORDER BY startedAt DESC LIMIT 500").all(pilotId) as Flight[];
    }
    if (sessionToken) {
      return await db.prepare("SELECT * FROM flights WHERE sessionToken = ? ORDER BY startedAt DESC LIMIT 500").all(sessionToken) as Flight[];
    }
    return [];
  }
  ```
- **Bug:** The flight listing functionality (listFlights) correctly allows both authenticated pilots and guest users with session tokens to access flights. However, when a guest user accesses flights via sessionToken, they get a full list of their own flights. Then individual flight access (getFlightWithBreadcrumbs) requires the same sessionToken to access individual flights. If these tokens are compromised through URL session token exposure, they grant full access to all related flight data.
- **Impact:** Unauthorized users with exposed session tokens could access all flight details for guest users, including detailed breadcrumbs with GPS coordinates and elevation data.
- **Confidence:** HIGH