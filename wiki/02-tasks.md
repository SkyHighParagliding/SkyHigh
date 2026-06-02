---
name: Task List — All Phases and Acceptance Criteria
description: 35 tasks across 5 phases + code review remediation. Security, wind map, hardening, production, backlog, code quality.
type: wiki
---

# Task List — 39 Items Across 7 Phases + Code Review

---

## Phase 0: Account Setup (✅ COMPLETE — May 2026)

**Purpose:** Establish institutional ownership of all critical infrastructure accounts under club identity before deployment.  
**Owner:** web@skyhighparagliding.org.au (club Google Workspace)  
**Credential Storage:** Club password manager (web@ account) + encrypted file in Google Drive (backup)  
**Status:** All 4 tasks complete. Phase 4 deployment unblocked.

### TASK-ACCT-001 ✅ Create GitHub Organization for Club
- **Completed:** 2026-05-15
- **What was done:** Created GitHub org `SkyHighParagliding` (email: web@skyhighparagliding.org.au). Made SkyHigh repo public (Free plan requirement). Transferred repo from `jonpamment-prog/SkyHigh` → `SkyHighParagliding/SkyHigh`. Updated local remote: `git remote set-url origin https://github.com/SkyHighParagliding/SkyHigh.git`

### TASK-ACCT-002 ✅ Create Railway Project for Club
- **Completed:** 2026-05-15
- **What was done:** Created Railway project under SkyHighParagliding org (trial account). Linked to GitHub repo with auto-deploy on `main`. Created PostgreSQL database service (online, Railway-hosted). DATABASE_URL auto-injected by Railway. App deployed and running at https://skyhigh-production.up.railway.app

### TASK-ACCT-003 ✅ Create Cloudflare R2 Account for Club
- **Completed:** 2026-05-15
- **What was done:** Created Cloudflare account (web@skyhighparagliding.org.au). Created R2 bucket `skyhigh-media`. Enabled Public Development URL. Generated API token (Object Read & Write). All credentials stored in `.env` and club password manager.

### TASK-ACCT-004 ✅ Obtain Gemini API Key from Club Google Workspace
- **Completed:** 2026-05-16
- **What was done:** Obtained Gemini API key via Google AI Studio (web@skyhighparagliding.org.au). Key installed in `.env` as `GEMINI_API_KEY`. Stored in club password manager.

---

## Code Review Remediation (Sonnet — 2026-05-07)

Identified by running the code-simplifier plugin with Sonnet 4.6. Plan file: `C:\Users\User\.claude\plans\make-a-plan-to-sleepy-biscuit.md`

### TASK-REVIEW-A ✅ Constants & Utilities (Foundation)
- **Status:** ✅ DONE — commit `673fa74`
- **What:** Added `PLAY_SPEEDS`, `PlaySpeed`, `nextSpeed()`, `TRAY_HANDLE_HEIGHT_PX` to `windMapTypes.ts`. Added `formatWindMapTime()` to `dateUtils.ts`.
- **Acceptance Criteria:** Both utilities exported and consumed by wind map components.

### TASK-REVIEW-B ✅ React.memo + useCallback Stabilisation
- **Status:** ✅ DONE — commit `673fa74`
- **What:** `WindCanvas` wrapped in `React.memo`. `cycleSpeed` wrapped in `useCallback` using `nextSpeed()`. `onTransformChange` inline arrow extracted to stable `handleTransformChange`. `formattedTime` uses shared utility.
- **Acceptance Criteria:** Tray toggle does not trigger `WindCanvas` re-render (verify via React DevTools Profiler).

### TASK-REVIEW-C ✅ Accessibility Batch (Critical fix)
- **Status:** ✅ DONE — commit `673fa74`
- **What:** `inert={!trayOpen}` on tray content. `aria-hidden` on all decorative icons. `aria-label` on play/speed buttons. `aria-label` + `aria-valuetext` on timeline slider.
- **Acceptance Criteria:** Tab through closed tray — focus must not land on hidden controls. Screen reader announces slider as human time string, not Unix ms.

### TASK-REVIEW-D ✅ Tray + Mode Toggle Extraction
- **Status:** ✅ DONE — commit `9b324fe`
- **Prerequisites:** A, B, C
- **Estimated effort:** M (~27% daily / ~5.5% weekly at Sonnet)
- **What:** Extract ~47-51 LOC tray JSX into `src/components/windmap/WindMapScrubberTray.tsx`. Extract 17-line modeToggle JSX into `src/components/windmap/WindMapModeToggle.tsx`. Eliminates all current duplication between the two wind map components.
- **Acceptance Criteria:** Both wind map views render identically. `tsc --noEmit` clean for changed files. Tray and mode toggle function correctly.

### TASK-REVIEW-E ✅ Remove backdrop-blur from Tray Body
- **Status:** ✅ DONE — commit `036a8bc`
- **Prerequisites:** D (targets the extracted component)
- **Estimated effort:** XS (~5% daily / ~1% weekly at Sonnet)
- **What:** Replace `backdrop-blur-md` on tray body with `bg-black/60`. Eliminates GPU compositor pressure during 300ms Canvas animation on Android.
- **Acceptance Criteria:** Animation smooth on mobile emulation. Visual appearance preserved (dark tray over dark canvas).

### TASK-REVIEW-G ✅ Admin grid fetch-now routes: await result, update status keys
- **Status:** ✅ DONE — commits `b0edb5b`, `9621169`
- **What:** Manual "Fetch Now" buttons were fire-and-forget — `xGridLastRun` settings keys were never updated after manual fetches, and errors were silently swallowed. Fixed: routes now await the fetch and write `LastRun`/`LastResult` on success/failure. Settings endpoint now derives grid last-run timestamps directly from `wind_grid_data.updatedAt` and `extended_wind_grids.computedAt` — the definitive source of truth regardless of trigger type.
- **Acceptance Criteria:** Admin panel timestamps update after manual fetch. Errors surface as red toast.

### TASK-REVIEW-F ⬜ useWindPlayback Hook (Optional)
- **Status:** ⬜ TODO (deferrable — all Critical/High/Medium issues resolved by A–E)
- **Prerequisites:** A, B, C, D
- **Estimated effort:** M-L (~40% daily / ~8% weekly at Sonnet)
- **What:** Extract playback state (`isPlaying`, `speed`, `currentTime`, interval effect) into `src/hooks/useWindPlayback.ts`. Further reduces duplication between the two wind map components.
- **Acceptance Criteria:** Playback and scrubber function correctly. `tsc --noEmit` clean.

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

## Phase 3: Short-Term Hardening (✅ All Complete)

Completed 2026-05-07. Security and code quality improvements.

### TASK-019 ✅ JSON.parse Guards
Add try-catch guards to all JSON.parse() calls.
- **Acceptance Criteria:** Guards implemented in:
  - Server: `server/routes/sites/crud.ts` (safeJsonParse), `server/routes/sites/archive.ts`, `server/routes/sites/media.ts`, `server/routes/procedures.ts`, `server/routes/sites/helpers.ts`
  - All guards return safe fallback (empty array, empty object, or default value)
- **Completed:** 2026-05-07. All JSON.parse calls protected.

### TASK-020 ✅ Proper Pagination for 6 List Endpoints
Add limit/offset validation and X-Total-Count header.
- **Acceptance Criteria:** 6 endpoints (GET /api/sites, /contacts, /contacts/search, /procedures, /news, /pageviews) validate `?limit` (1–500, default 50) and `?offset` (≥0, default 0). Return `X-Total-Count` header with total results. Pagination params returned in response body (total, limit, offset, hasMore).
- **Completed:** 2026-05-07. All 6 endpoints return X-Total-Count header + pagination response body.

### TASK-021 ✅ Structured Logging
Replace all `console.log/warn/error` with structured JSON logging.
- **Acceptance Criteria:** All server-side logs emit JSON with timestamp, level, context, message, and optional data. Implemented in `server/utils/logger.ts`. Used throughout codebase via `createLogger()` factory.
- **Completed:** 2026-04-30. Structured JSON logging implemented and in use.

### TASK-022 ✅ Input Validation Middleware
Add input validation to mutation endpoints.
- **Acceptance Criteria:** POST/PUT/DELETE endpoints validate request body. Return 400 with field-level error messages. Custom validation middleware in `server/middleware/validation.ts` (not Zod, but functional equivalent).
- **Completed:** 2026-05-07. Custom validation middleware with sanitizeString, validateEmail, validateUrl, phoneNumber rules.

### TASK-023 ✅ constants.ts for Magic Numbers
Centralize all hardcoded configuration values.
- **Acceptance Criteria:** Create `server/constants.ts` with: DEFAULT_LIMIT (50), MAX_LIMIT (500), SESSION_TTL_MS, CSRF_TOKEN_EXPIRY_MS, cache TTLs, rate limit windows, API limits, database pool config. Replace hardcoded numbers.
- **Completed:** 2026-05-07. `server/constants.ts` created with 40+ constants. Imported by: pagination.ts, sessionTokens.ts, csrf.ts.

### TASK-024 ✅ Database Indexes for Production
Add indexes to PostgreSQL for production performance.
- **Acceptance Criteria:** Indexes on sites, contacts, news, pages, weather, sessions, and more. Created as migration `server/migrations/050_add_performance_indexes.ts` with 20+ indexes.
- **Completed:** 2026-04-28. Migration 050 creates all production indexes.

### TASK-025 ✅ Session Token Hardening
Extend token TTL logic and add cleanup.
- **Acceptance Criteria:** Session tokens have 24-hour TTL (not 7 days as originally planned). Automatic cleanup scheduler removes expired tokens every hour. IP/userAgent tracking for session validation.
- **Completed:** 2026-04-30. SessionManager in `server/utils/sessionTokens.ts` with TTL, cleanup scheduler, and activity tracking.

---

## Phase 4: Production Deployment Prep (✅ 3 of 4 Complete)

Infrastructure and configuration hardening. Status: 2026-05-07.

### TASK-026 ✅ PostgreSQL Provisioning
Set up PostgreSQL instance on Railway.
- **Acceptance Criteria:** PostgreSQL accessible via `DATABASE_URL` env var. Connection pooling configured with pool size, idle/connection timeouts, statement timeout.
- **Completed:** 2026-04-30. `server/pgDb.ts` fully configured with:
  - Connection pool max=20, idle timeout=60s, connection timeout=10s, statement timeout=30s
  - Pool monitoring and error logging
  - Automatic param conversion (? → $1, @param → $1, etc.) for compatibility with SQLite codebase

### TASK-027 ✅ Cloudflare R2 Configuration
Set up R2 bucket and credentials.
- **Acceptance Criteria:** R2 bucket created. Credentials (account_id, access_key_id, secret_access_key) in `.env`. `storage.ts` configured to use R2 in production with fallback to local `/uploads/` in dev.
- **Completed:** 2026-04-30. `server/storage.ts` with:
  - Full R2 S3 client support via AWS SDK
  - Env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
  - Fallback to local filesystem if R2 not configured
  - Consistent key namespace (images/, branding/, attachments/, submissions/)

### TASK-028 ⬜ CSRF Redis Store for Multi-Instance
Move CSRF tokens from in-memory to Redis for multi-instance support.
- **Acceptance Criteria:** CSRF tokens stored in Redis (24-hour TTL). Works across multiple server instances. Fallback to in-memory if Redis unavailable (dev mode).
- **Status:** Deferred — single-instance Railway deployment does not require Redis. CSRF currently in-memory (`server/utils/csrf.ts`). Can implement if multi-instance scaling needed.

### TASK-029 ⚠️ Harden DEFAULT_ADMINS for Production
Ensure no hardcoded admins in production.
- **Acceptance Criteria:** `DEFAULT_ADMINS` documented as dev-only. Production admin created via one-time setup script. No plaintext passwords in code or config.
- **Status:** Partial — DEFAULT_ADMINS loaded from env var in `server/routes/auth.ts`. Passwords not in code, but no setup script yet. Recommend: document env var format in .env.template.

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

### TASK-032 ⬜ Multi-Club White-Label Test
Deploy second instance of SkyHigh for different club.
- **Acceptance Criteria:** Codebase supports multiple clubs with separate databases and branding. Second deployment (different club) works independently. Test white-label customization (name, logo, default wind map viewport).
- **Status:** Backlog (depends on Phase 4 production deployment)

### TASK-035 ✅ Add cross-env to package.json dependencies
`cross-env` is invoked via `npx` in the start script, causing Railway to download it fresh on every cold start.
- **Completed:** 2026-05-20. Added `cross-env: ^7.0.3` to devDependencies. Changed both `npx cross-env` → `cross-env` in start and analyze scripts. Verified resolution via `node -e "require('cross-env')"`.
- **Status:** ✅ DONE

---

## Phase 6: Grid Configurability (✅ Complete)

### TASK-033 ✅ Configurable Grid Bounds with Visual Map Selector
Rename grid identifiers from location-specific to purpose-descriptive, and make grid coverage areas configurable via admin UI.
- **Acceptance Criteria:** All `victoria`/`wide` grid naming replaced with `fine`/`coarse`. Grid bounds stored in settings table, read at fetch time with fallback to hardcoded defaults. Admin panel has map-based selector with two draggable bounding boxes, live point count / fetch time indicators, containment enforcement (fine must be within coarse), and legend. POST endpoint validates bounds + point limits.
- **Completed:** 2026-05-07. Commits d953a05, 77a454a.

---

## Phase 7: UX Refinements (✅ Complete)

### TASK-034 ✅ Wind Map Scrubber Retractable Tray
Convert the static bottom scrubber bar on both wind map variants into a slide-up tray with a pull-tab.
- **Acceptance Criteria:** Tab (24 × 100 px, centred at bottom edge) and tray move as one unit. Default state: retracted (tab only visible). Click tab to pull tray up; click again to retract. Chevron rotates to indicate direction. Both `SitesWindMap` and `WindMapProto` updated.
- **Completed:** 2026-05-07. `src/components/SitesWindMap.tsx`, `src/components/WindMapProto.tsx`.

---

## Phase 9: Closure Calendar (✅ Complete)

### TASK-036 ✅ Site Scheduled Closure Calendar

- **Status:** ✅ DONE — 2026-05-21
- **Prerequisites:** Phase 1–3 (security hardening complete)
- **Estimated effort:** L
- **Description:** Multi-date calendar picker in admin site edit page. Admins select specific future closure dates; the system auto-generates a home-page banner 7 days before the first closure date, shows red badges on site cards and detail pages, and flags closure days in the 7-day weather outlook.
- **Acceptance Criteria:**
  - DB migration `020_site_closure_dates.sql` runs on both SQLite and PostgreSQL
  - `GET /api/sites/closure-banners` returns active banner windows; `PUT /api/sites/:id/closure-dates` is admin-only
  - Status dropdown replaced by calendar + "Permanently Closed" checkbox in AdminSiteEdit
  - Selected dates turn red in calendar; banner window preview shown live
  - Home page shows blue banner for each active closure window
  - Site cards and detail show green Open + red upcoming-closure pill; red Closed pill on day of closure
  - 7-day outlook flags closure days with small red "Closed" label
  - Emergency `temporarilyClosed` system unchanged alongside new scheduled closure system
- **Files changed:**
  - `server/pg_migrations/020_site_closure_dates.sql` (NEW)
  - `server/routes/sites/closures.ts` (NEW)
  - `server/routes/sites/index.ts` (register closures router before crud)
  - `server/routes/sites/crud.ts` (join closure dates into GET responses)
  - `src/types/api.ts` (add `upcomingClosureDates` to Site)
  - `src/utils/closureStatus.ts` (NEW — shared closure helper)
  - `src/components/ui/ClosureDatePicker.tsx` (NEW — custom multi-date picker)
  - `src/hooks/useSiteForm.ts` (add closureDates state, load, save)
  - `src/hooks/api/useClosureBanners.ts` (NEW — react-query hook)
  - `src/hooks/api/index.ts` (export useClosureBanners)
  - `src/pages/AdminSiteEdit.tsx` (replace Status dropdown)
  - `src/pages/Sites.tsx` (updated badge priority logic)
  - `src/pages/SiteDetail.tsx` (updated badge + upcoming closure strip)
  - `src/components/weather/ExtendedOutlookPanel.tsx` (red "Closed" label on closure days)
  - `src/pages/Home.tsx` (blue closure banner rows)

---

## Phase 10: Infrastructure — Postgres Dev + SQLite Removal (✅ Complete)

### TASK-PGDEV ✅ Postgres Dev Setup
- **Completed:** 2026-05-27 (session 22)
- **What was done:** Docker Compose for local Postgres 16 (`docker-compose.dev.yml`). `DATABASE_URL` set in `.env`. All 37 migrations applied to local PG. New quote-aware SQL splitter in `server/db.ts` (handles single-quoted strings, dollar-quoted blocks, `--` line comments). `scripts/lint-migrations.mjs` pre-commit lint hook for unquoted camelCase columns and duplicate version numbers.

### TASK-TIDYHQ-REDESIGN ✅ TidyHQ Flow Redesign (SO/SSO Fix)
- **Completed:** 2026-05-27 (session 22)
- **What was done:** Root cause found — TidyHQ group labels `"S.O."` / `"S.S.O."` never matched `"SO"` / `"SSO"` in group_mappings. `safetyOfficerType` was never set. Migration 035 dropped dead `isSO`/`isSSO` columns. Migration 036 fixed group_mappings. `server/routes/tidyhq.ts` webhook handler fixed. `server/routes/contacts.ts` new `POST /tidyhq-smart-import` endpoint. `src/pages/AdminContacts.tsx` Quick Import button. Committee data re-imported (commit 724dfe7).

### TASK-SQLITE-REMOVAL ✅ Complete SQLite → PostgreSQL Migration
- **Completed:** 2026-05-27 (session 23)
- **What was done:** Removed `better-sqlite3` entirely. Converted all server code (routes, services, utils, middleware, seed.ts, server.ts) to use `query`/`queryOne`/`execute`/`transaction` from `server/pg.ts`. Deleted 28 migration files, 4 dead utility files, `sqliteDb.ts`, `pgDb.ts`, `migrate_storage.ts`, `api.test.ts`. Stripped `server/db.ts` to PG-only migration runner. Zero `db.prepare`/`import db from` references in codebase.
- **Bug caught during dev test:** `seed.ts` passed JS boolean `true` for `safety_sections.enabled` (INTEGER column) — fixed to `1`.

---

## Phase 8: Future / Low Priority

### TASK-MIG-001 ⬜ Railway → Fly.io Migration
- **Status:** ⬜ DEFERRED — Pending future need
- **Description:** Migrate SkyHigh hosting from Railway to Fly.io for potential cost savings.
- **Reference:** `wiki/future/08-flyio-migration-plan.md`
- **Estimated effort:** ~2 hours active work, ~2 days calendar time

---

## Summary

| Phase | Name | Tasks | Status | Completion Date |
|---|---|---|---|---|
| 0 | Account Setup | 4 | ✅ Complete | 2026-05-16 |
| 1 | Security Hardening | 7 | ✅ Complete | 2026-04-30 |
| 2 | Wind Map & Weather | 11 | ✅ Complete | 2026-05-05 |
| 3 | Short-Term Hardening | 7 | ✅ Complete | 2026-05-07 |
| 6 | Grid Configurability | 1 | ✅ Complete | 2026-05-07 |
| 7 | UX Refinements | 1 | ✅ Complete | 2026-05-07 |
| 9 | Closure Calendar | 1 | ✅ Complete | 2026-05-21 |
| 10 | Postgres Dev + SQLite Removal | 3 | ✅ Complete | 2026-05-27 |
| 4 | Production Deployment | 4 | ✅ Complete | 2026-05-30 |
| 5 | Hardening & Audit | 1 | ✅ Complete | 2026-06-02 |
| 8 | Future / Low Priority | 1 | ⬜ DEFERRED | — |
| Code Review | Sonnet Review | 7 | 6✅ / 1⬜ | — |

---

**Task Summary:**
- **Completed:** Phases 0, 1, 2, 3, 6, 7, 9, 10 + Tasks 026, 027, 035 from Phase 4/5 + Review A–E, G
- **Partial (1):** Task 029 (env var loaded, no setup script yet)
- **Deferred (2):** Task 028 (single-instance, no Redis needed), Task MIG-001 (Fly.io migration)
- **Backlog (3):** Tasks 030, 031, 032
- **Review deferred (1):** TASK-REVIEW-F (useWindPlayback hook extraction)

Last updated: 2026-05-27
