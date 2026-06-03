# Current Tasks — Last updated: 2026-05-27

> **6 incomplete tasks remain.** Pick from this list when resuming.
> Companion file: `RESUME_HERE.md` has the same info in a different format.

## ✅ Done

### TASK-031 — Pilot XC Flight History Export (CSV/GPX)
- **Completed:** 2026-06-03
- **What changed:** Added `GET /api/flights/export?format=csv|gpx` endpoint in `server/routes/flights.ts`. Implemented database queries to resolve sites landing zones and bulk flight breadcrumbs. Added "Export All" dropdown menu to `src/pages/FlightHistory.tsx` list view. Download logic uses secure fetch with authorization headers.

### TASK-SQLITE-REMOVAL — Complete SQLite → PostgreSQL migration
- **Completed:** 2026-05-27
- **What changed:** Removed `better-sqlite3` entirely. Converted all server code to use
  `query`/`queryOne`/`execute`/`transaction` from `server/pg.ts`. Deleted 28 migration files,
  4 dead utility files, `sqliteDb.ts`, `pgDb.ts`, `migrate_storage.ts`, `api.test.ts`.
  Stripped `server/db.ts` to PG-only. Zero `db.prepare` / `import db from` references remain.
  **NOT YET PUSHED — run `git push` to deploy.**

### TASK-035 — Add cross-env to package.json
- **Completed:** 2026-05-20
- **What changed:** Added `cross-env: ^7.0.3` to devDependencies. Both `npx cross-env` → `cross-env` in start + analyze scripts.

---

## 🔴 Quick Wins (start here)

---

## 🟡 Medium Priority

### TASK-030 — Siteguide Version Change Email Notification
- **Effort:** M (3–5 hours)
- **What:** Daily cron checks siteguide.org.au for version changes on linked guides; emails site contacts on update
- **Infrastructure exists:** Email utility (`server/utils/email.ts`), scheduled jobs (via `node-cron`), site contacts in DB, `SITEGUIDE_VERSION_CHECK_TTL_MS` constant
- **Needs:**
  1. Scraper to detect version changes (last-modified headers, content hash, or scrape version string)
  2. Store last-known version per site guide in DB
  3. Daily cron job to check all linked guides
  4. On version change: generate email, look up site contacts, send notification
  5. Log notification to audit table visible in admin dashboard
- **Depends on:** How consistently siteguide.org.au surfaces version changes

---

## 🔵 Low Priority / Deferred

### TASK-028 — CSRF Redis Store for Multi-Instance
- **Effort:** M (2–3 hours)
- **Current:** CSRF tokens in-memory `Map` (`server/utils/csrf.ts`). 24h TTL, hourly cleanup via `setInterval`.
- **Problem:** If Railway scales to 2+ instances, tokens generated on instance A won't validate on instance B → spurious 403 errors
- **Fix:** Move to Redis (SET/GET/DEL with 24h TTL). Keep Map as fallback when `REDIS_URL` not set.
- **Deferred because:** Single-instance only. No immediate scaling need.

### TASK-REVIEW-F — useWindPlayback Hook Extraction
- **Effort:** M (2–3 hours)
- **What:** Extract shared playback state from `WindMapProto.tsx` and `SitesWindMap.tsx` into `src/hooks/useWindPlayback.ts`
- **Shared state:** `isPlaying`, `playSpeed`, `currentTime`, `playIntervalRef` with `setInterval` effect, `cycleSpeed()` using `nextSpeed()`, `formatWindMapTime()`
- **Non-critical:** ~30–40 lines duplicated. Review tasks A–E already addressed perf concerns.
- **Pick up when:** Touching wind map code — refactor as you go.
- **Files:** `src/components/WindMapProto.tsx`, `src/components/SitesWindMap.tsx`, new `src/hooks/useWindPlayback.ts`

---

## 🟣 Large / Strategic

### TASK-032 — Multi-Club White-Label Test
- **Effort:** L (1–2 days)
- **What:** Deploy second independent instance for a different club; prove white-labellability
- **Infrastructure exists:** Branding engine (`server/routes/branding.ts`, `SettingsContext.tsx`), admin panel for club name/logo/colors, custom home page, wind map viewport
- **Needs:**
  1. Second Railway project + PostgreSQL database
  2. Same codebase, different `DATABASE_URL` + club name
  3. Customize branding through admin panel
  4. Different domain (e.g., `anotherclub.org.au`)
  5. Verify no data leakage between deployments
- **Risk:** May be hardcoded "SkyHigh" references that should pull from settings
- **Files:** Multiple — full codebase audit for hardcoded strings
