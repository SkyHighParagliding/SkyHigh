# Current Tasks — Last updated: 2026-05-27

> **6 incomplete tasks remain.** Pick from this list when resuming.
> Companion file: `RESUME_HERE.md` has the same info in a different format.

## ✅ Done

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

### TASK-031 — Pilot XC Flight History Export (CSV/GPX)
- **Effort:** S (1–2 hours)
- **What:** Pilots can download their submitted flights from FlightHistory page
- **Data exists:** `GET /api/flights` + `GET /api/flights/:id` with `breadcrumbs[]` (lat/lon track)
- **Needs:**
  1. New endpoint: `GET /api/flights/export?format=csv|gpx` in `server/routes/flights.ts`
  2. CSV: flatten flight metadata (date, site, distance, landing zone) into rows
  3. GPX: convert `breadcrumbs` array into GPX XML track with timestamps
  4. Frontend: download button on `src/pages/FlightHistory.tsx` with format selector
  5. Set `Content-Disposition: attachment` header for file download
- **Files:** `server/routes/flights.ts`, `src/pages/FlightHistory.tsx`

---

## 🟡 Medium Priority

### TASK-029 — Harden DEFAULT_ADMINS for Production
- **Effort:** S (1 hour)
- **Done:** `DEFAULT_ADMINS` loaded from env var JSON; passwords hashed with bcrypt on startup; `server/routes/auth.ts` line ~79–90
- **Missing:**
  1. No guided one-time setup script (`scripts/create-admin.ts`) — operator must manually craft JSON env var
  2. No documentation in `.env.template` about expected format
  3. `ensureDefaultAdmin()` runs on every startup with no feedback about existing admin
- **Needs:**
  1. Write `scripts/create-admin.ts` — prompts for email + password, hashes, inserts, confirms
  2. Document `DEFAULT_ADMINS` format in `.env.template` with note it's dev-only
  3. Add note in admin docs about running setup script on first production deploy
- **Files:** `server/routes/auth.ts`, `.env.template`, new `scripts/create-admin.ts`

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
