---
name: Task List — All Phases and Acceptance Criteria
description: 33 tasks across 5 phases (security, wind map, hardening, production, backlog) with status and AC
type: wiki
---

# Task List — 33 Items Across 5 Phases

## Phase 1: Security Hardening (✅ All Complete)

Completed 2026-04-30 after security audit. Focus: OWASP Top 10 coverage.

### TASK-001 ✅ SQL Injection Prevention
Parameterize all dynamic SQL queries. Use bound parameters for user input.
- **Acceptance Criteria:** No string interpolation in SQL; all inputs passed as `$1, $2, ...` in parameterized queries.
- **Completed:** 2026-04-15. All `server/routes/` use parameterized queries via pg/sqlite3 drivers.

### TASK-002 ✅ Plaintext Password Guard
Add console warning on startup if admin password is plaintext.
- **Acceptance Criteria:** Server logs warning if `DEFAULT_ADMINS` contains plaintext passwords; no hardcoded secrets in code.
- **Completed:** 2026-04-16. Warning logs on startup if password is plaintext.

### TASK-003 ✅ CSRF Token Protection
Implement CSRF tokens for all POST/PUT/DELETE mutations.
- **Acceptance Criteria:** Every mutation endpoint validates CSRF token. GET requests exempt. Token stored in-memory (dev) or Redis (production, TBD).
- **Completed:** 2026-04-17. CSRF middleware on all mutation routes. Token validation enforced.

### TASK-004 ✅ SSRF Prevention
Validate all external API URLs to prevent Server-Side Request Forgery.
- **Acceptance Criteria:** Gemini, Open-Meteo, and TidyHQ requests use allowlisted domains only. No user-controlled URLs passed to fetch.
- **Completed:** 2026-04-18. All external API calls hard-coded; no user-controlled URLs.

### TASK-005 ✅ Hardcoded Secret Removal
Remove all hardcoded API keys, tokens, and credentials from source code.
- **Acceptance Criteria:** All secrets in `.env` or `.env.example`; no plaintext keys in code. `.env` in `.gitignore`.
- **Completed:** 2026-04-19. All secrets moved to `.env.template` with documentation.

### TASK-006 ✅ Rate Limiting
Implement rate limiting on public endpoints to prevent abuse.
- **Acceptance Criteria:** GET /api/sites limited to 100 req/min per IP. POST endpoints (login, submit flight) limited to 10 req/min per IP.
- **Completed:** 2026-04-25. Rate limiter middleware on all public routes.

### TASK-007 ✅ PostgreSQL Connection Pooling
Configure PostgreSQL connection pool for production.
- **Acceptance Criteria:** Pool size = 10 in production, 2 in dev. Idle timeout = 30s. Connection timeout = 5s.
- **Completed:** 2026-04-26. `pgDb.ts` configures pool with correct limits.

---

## Phase 2: Wind Map & Weather Infrastructure (✅ All Complete)

Completed 2026-05-05. Focus: Real-time wind data, scheduled jobs, grid caching.

### TASK-008 ✅ Grid Caching (Core)
Fetch and cache ECMWF continental wind grids (Victoria 0.35°, Wide 2.0°) in database.
- **Acceptance Criteria:** Grids fetched daily at 5:00am (Victoria) and 5:13am (Wide) Melbourne time. Cached in `wind_grid_data` table. 7-day rolling cleanup (delete > 7 days old).
- **Completed:** 2026-04-28. `victoriaGrid.ts` handles fetch and cleanup. Runs on schedule.

### TASK-009 ✅ Scheduled Jobs Infrastructure
Set up cron-like scheduler for daily grid fetch, TidyHQ sync, and other periodic tasks.
- **Acceptance Criteria:** Scheduler runs every minute, checks which tasks are due (Melbourne time). No polling loop; event-driven.
- **Completed:** 2026-04-28. Cron-like scheduler in `weather.ts`. Runs on startup and every minute thereafter.

### TASK-010 ✅ Startup Catch-Up
On server restart, if grid was never fetched or last fetch > 12 hours ago, trigger fresh fetch with delay.
- **Acceptance Criteria:** Startup detects stale grid (using fetch timestamp, not data age). If stale, schedules fetch after 60s (Victoria) / 3min (Wide) to allow server initialization.
- **Completed:** 2026-05-01. Startup check looks at `victoriaGridLastRun` and `wideGridLastRun` settings. Fetches if > 12 hours ago.

### TASK-011 ✅ Open-Meteo API Key Support
Add optional Open-Meteo API key to speed up weather queries.
- **Acceptance Criteria:** `OPENMETEO_API_KEY` env var recognized. If set, queries use paid tier (1000 req/day). If not, uses free tier (100 req/day).
- **Completed:** 2026-05-01. `weather.ts` checks for key and configures tier accordingly.

### TASK-012 ✅ Manual Grid Fetch Trigger
Admin dashboard button to manually trigger grid fetch immediately.
- **Acceptance Criteria:** Admin-only endpoint POST /api/admin/grid-fetch-now. Returns 200 with fetch status. No blocking (fire-and-forget).
- **Completed:** 2026-05-02. Endpoint returns immediately; fetch runs in background. No infinite spinner.

### TASK-013 ✅ 7-Day Rolling Cache
Database cleanup removes grids older than 7 days every fetch cycle.
- **Acceptance Criteria:** After each grid fetch, delete all `wind_grid_data` rows where fetch_time < NOW() - 7 days.
- **Completed:** 2026-04-28. Cleanup runs in `victoriaGrid.ts` after each fetch.

### TASK-014 ✅ Bulk Hero Image Upload
Admin can upload multiple hero images at once for sites.
- **Acceptance Criteria:** Admin dashboard file picker (multi-select). Images validated (magic bytes, Gemini moderation). Stored to R2 or `/uploads/`. Site associations created/updated.
- **Completed:** 2026-05-02. Bulk upload in admin panel. Images validated and stored.

### TASK-015 ✅ Admin Default Wind Map Center + Zoom Button
Admin button sets default viewport (center lat/lon, zoom level) for wind map.
- **Acceptance Criteria:** Admin panel has "Set Default View" button. Clicking stores current map center + zoom to database. On page load, wind map opens at that viewport.
- **Completed:** 2026-05-03. Button saves to database. Frontend reads on load via SettingsContext.

### TASK-016 ✅ Settings Context Fix (Frontend)
Wind map viewport settings (center, zoom) persisted across page reloads.
- **Acceptance Criteria:** SettingsContext reads from database and localStorage. Wind map viewport restored on page load.
- **Completed:** 2026-05-03. Frontend loads settings from API and localStorage on mount.

### TASK-017 ✅ Public Sites Cache Pagination Fix
Public sites list cache now respects pagination parameters.
- **Acceptance Criteria:** If request includes `?limit=500` or `?offset=...`, bypass cache and fetch fresh. Cache only for default pagination (no limit/offset params).
- **Completed:** 2026-05-04. Cache check in `server/routes/sites/index.ts` bypasses if custom pagination params present.

### TASK-018 ✅ Open-Meteo Integration + Fallback
Wind data sourced from pre-cached ECMWF grids; Open-Meteo available as fallback.
- **Acceptance Criteria:** Wind map uses cached ECMWF first. If cache miss, falls back to Open-Meteo API. Bilinear interpolation at render time.
- **Completed:** 2026-05-05. Interpolation in `windmapUtils.ts` uses cached grid data; API fallback available.

---

## Phase 3: Short-Term Hardening (⬜ All TODO)

Security and code quality improvements. Expected start: 2026-05-07.

### TASK-019 ⬜ JSON.parse Guards
Add try-catch guards to all JSON.parse() calls.
- **Acceptance Criteria:** 9 locations identified and fixed:
  - Server: `server/routes/flights/gpx.ts` (GPX parsing), `server/routes/retrieval/sse.ts` (message deserialization), `server/utils/...` (2 more)
  - Frontend: `src/utils/apiClient.ts` (response body), `src/components/windmap/...` (3 more)
  - All guards log error and return safe fallback (empty object, null, or default)
- **Status:** TODO — not yet started

### TASK-020 ⬜ Proper Pagination for 6 List Endpoints
Add limit/offset validation and documentation.
- **Acceptance Criteria:** 6 endpoints (GET /api/sites, /flights, /contacts, /procedures, /images, /messages) validate `?limit` (1–500, default 50) and `?offset` (≥0, default 0). Return `X-Total-Count` header with total results. Document in API schema.
- **Status:** TODO — not yet started

### TASK-021 ⬜ Structured Logging
Replace all `console.log/warn/error` with structured JSON logging.
- **Acceptance Criteria:** All server-side logs emit JSON (not plain text). Include timestamp, level, component, message, and context (user_id, request_id, etc.). Frontend logs captured to localStorage (500 KB max) for debugging.
- **Status:** TODO — not yet started

### TASK-022 ⬜ Input Validation Middleware (Zod)
Add Zod schemas to all mutation endpoints.
- **Acceptance Criteria:** POST/PUT/DELETE endpoints validate request body against Zod schema. Return 400 with field-level error messages. 10 schemas identified and implemented.
- **Status:** TODO — not yet started

### TASK-023 ⬜ constants.ts for Magic Numbers
Centralize all hardcoded configuration values.
- **Acceptance Criteria:** Create `server/constants.ts` with: MAX_LIMIT (500), DEFAULT_LIMIT (50), GRID_CLEANUP_AGE_DAYS (7), RATE_LIMIT_WINDOW (60s), etc. Replace all hardcoded numbers in code.
- **Status:** TODO — not yet started

### TASK-024 ⬜ Database Indexes for Production
Add indexes to PostgreSQL for production performance.
- **Acceptance Criteria:** Indexes on: sites (club_id), flights (pilot_id, submitted_date), messages (retrieval_id, created_at), contacts (club_id). Create as migration in `server/pg_migrations/`.
- **Status:** TODO — not yet started

### TASK-025 ⬜ Session Token Hardening
Extend token TTL logic and add refresh token support (optional for Phase 3).
- **Acceptance Criteria:** Session tokens have 7-day TTL. Optional: refresh token endpoint to extend session without re-login. Token rotation on each refresh.
- **Status:** TODO — not yet started

---

## Phase 4: Production Deployment Prep (⬜ All TODO)

Infrastructure and configuration hardening. Expected start: 2026-05-10.

### TASK-026 ⬜ PostgreSQL Provisioning
Set up PostgreSQL instance on Replit or RDS.
- **Acceptance Criteria:** PostgreSQL accessible via `DATABASE_URL` env var. Migrations run on startup. Connection pooling configured. Automated backups enabled.
- **Status:** TODO — not yet started

### TASK-027 ⬜ Cloudflare R2 Configuration
Set up R2 bucket and credentials.
- **Acceptance Criteria:** R2 bucket created. Credentials (account_id, access_key_id, secret_access_key) in `.env`. `storage.ts` configured to use R2 in production.
- **Status:** TODO — not yet started

### TASK-028 ⬜ CSRF Redis Store for Multi-Instance
Move CSRF tokens from in-memory to Redis for multi-instance support.
- **Acceptance Criteria:** CSRF tokens stored in Redis (1-hour TTL). Works across multiple server instances. Fallback to in-memory if Redis unavailable (dev mode).
- **Status:** TODO — not yet started (low priority if single-instance Replit deployment)

### TASK-029 ⬜ Harden DEFAULT_ADMINS for Production
Ensure no hardcoded admins in production.
- **Acceptance Criteria:** `DEFAULT_ADMINS` documented as dev-only. Production admin created via one-time setup script. No plaintext passwords in code or config.
- **Status:** TODO — not yet started

---

## Phase 5: Feature Backlog (⬜ All TODO)

Long-term feature requests. No timeline committed.

### TASK-030 ⬜ Siteguide Version Change Email Notification
Email admin when site guide version changes on siteguide.org.au.
- **Acceptance Criteria:** Cron job checks siteguide.org.au every day. On version change, send email to site contacts. Log notification in admin dashboard.
- **Status:** Backlog

### TASK-031 ⬜ Pilot XC Flight History Export
Pilots can export their XC flight history as CSV or GPX.
- **Acceptance Criteria:** Pilot page with download button. Exports all flights submitted by that pilot. CSV includes distance, date, landing zone. GPX includes track (if available).
- **Status:** Backlog

### TASK-032 ⬜ Airspace NOTAM Overlay
Display active NOTAMs and restricted airspace on wind map.
- **Acceptance Criteria:** Placeholder layer. Currently non-functional. Will integrate CASA airspace data + Notam API when available.
- **Status:** Backlog (no API partner yet)

### TASK-033 ⬜ Multi-Club White-Label Test
Deploy second instance of SkyHigh for different club.
- **Acceptance Criteria:** Codebase supports multiple clubs with separate databases and branding. Second deployment (different club) works independently. Test white-label customization (name, logo, default wind map viewport).
- **Status:** Backlog (depends on Phase 4 production deployment)

---

## Summary

| Phase | Name | Tasks | Status | Completion Date |
|---|---|---|---|---|
| 1 | Security Hardening | 007 | ✅ Complete | 2026-04-30 |
| 2 | Wind Map & Weather | 011 | ✅ Complete | 2026-05-05 |
| 3 | Short-Term Hardening | 007 | ⬜ TODO | — |
| 4 | Production Deployment | 004 | ⬜ TODO | — |
| 5 | Feature Backlog | 004 | ⬜ TODO | — |
| | **TOTAL** | **33** | **18 ✅ / 15 ⬜** | — |

---

Last updated: 2026-05-06
