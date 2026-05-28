# RESUME_HERE — Last updated: 2026-05-28 (Session 27 end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — fully deployed, all audit fixes pushed

## Where I left off

Session 27 was an exhaustive 5-pass PostgreSQL database code audit. 81 bugs fixed across 30+ files in 5 rounds of parallel multi-agent review. All fixes committed and pushed to Railway. The codebase is now substantially hardened.

**All done this session:**
- Fixed production errors: HTML double-escaping on site cards, PG untyped param errors on site update
- Removed duplicate Admin link from mobile nav
- Reformatted committee card labels (SO/SSO inline, restored sort hierarchy)
- Added SafetyOfficerWidget (2 SSO + 5 SO random chips) to Safety & Rules home card
- Added FlyingSitesWidget (6 random SkyHigh sites, linked pills) to Flying Sites home card
- `photoAuthorised` now defaults to true when isCommittee or isSafetyCommittee toggled on
- Fixed `capture="user"` forcing camera-only on mobile photo upload
- Launched 5-pass parallel PostgreSQL audit — 81 total bugs fixed:
  - Pass 1 (30 bugs): COUNT bigint, unquoted camelCase, missing transactions, ghost SITES_COLUMNS, shop admin visibility broken, migration atomicity
  - Pass 2 (13 bugs): Password reset race condition, photoAuthorised/fullNameDisplay missing from POST INSERT, path traversal, banned-ips ::int, projects multi-step transactions
  - Pass 3 (14 bugs): safetyOfficerType never saved/returned, message reactions crashing, closure dates UTC vs Melbourne timezone, SITES_COLUMNS still missing 3 cols, retrieval duplicate race condition, pilot delete incomplete
  - Pass 4 (20 bugs): position field completely absent from contacts CRUD, 4 site columns (weatherGaugeUrl, heroImages, displayOnMap, displayInList) missing from sites PUT/POST, requireAuth dropped permission fields, cleanExpiredSessions dead code, R2 attachment cleanup using fs.existsSync on URLs, orphan retrieval rows on pilot/flight delete
  - Pass 5 (4 bugs): PUT /reorder/batch unreachable (route shadowing), projectCoordinator missing from projects, wrong linked field computation, unused import

## Last completed task
- [AUDIT-5] fifth-pass schema-first audit — commit 6274011

## Currently in progress
- None

## Next task to start
- Feature backlog: TASK-031 (XC Flight History Export) is the highest priority quick win
- Smart Search bugs BUG-A through BUG-G remain open (7 bugs, Q40–Q50 test run not completed)

## Open questions / blockers
- None

## Quick context refresher

Pure PostgreSQL codebase. All DB access via `server/pg.ts` (`query`, `queryOne`, `execute`, `transaction`).
INTEGER flag columns (contacts: `isAdmin`, `isSafetyCommittee`, etc.) must use `= 1`/`= 0` in SQL.
Sites boolean columns are TEXT `'true'`/`'false'` — different pattern.
**CRITICAL PG RULE**: SQL column aliases with camelCase MUST be double-quoted (`as "forecast_siteId"`),
otherwise PostgreSQL folds them to lowercase and JS property access breaks silently.
**AUDIT LESSON**: Always do schema-first cross-reference (read migrations → build complete column list → compare against code). Code-only review misses columns that exist in DB but are absent from INSERT/UPDATE/SELECT.
Local dev: Docker Postgres 16 (`skyhigh-pg-dev` container, port 5432) + `npm run dev`.
Weather forecasts: populated by `fetchWeatherData()` on startup + 15–30 min timer + manual /scrape-now.
