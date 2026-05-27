# RESUME_HERE — Last updated: 2026-05-27 (Session 26 end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — weather cards now working

## Where I left off

Session 26 is concluding. All workspace changes from the codebase reorganization (moving nested `SkyHigh/` files to root, cleaning up `.playwright-mcp` files, and establishing the unified `wiki/` directory) and the initial Area 1 autonomous database audit have been saved and committed.

**All done this session:**
- Saved current workspace state and committed codebase reorganization changes.
- Ensured `.env` file is securely wiped to prevent any secrets staying on disk.
- Verified no active server processes are left running on ports 3001 or 5173.


## What's next

1. Pick from the feature backlog — TASK-031 (XC Flight History Export) is the highest priority quick win.
2. Smart Search bugs BUG-A through BUG-G remain open (7 bugs, Q40–Q50 test run not completed).

## Open questions / blockers
- None

## Quick context refresher

Pure PostgreSQL codebase. All DB access via `server/pg.ts` (`query`, `queryOne`, `execute`, `transaction`).
INTEGER flag columns (contacts: `isAdmin`, `isSafetyCommittee`, etc.) must use `= 1`/`= 0` in SQL.
Sites boolean columns are TEXT `'true'`/`'false'` — different pattern.
**CRITICAL PG RULE**: SQL column aliases with camelCase MUST be double-quoted (`as "forecast_siteId"`),
otherwise PostgreSQL folds them to lowercase and JS property access breaks silently.
Local dev: Docker Postgres 16 (`skyhigh-pg-dev` container, port 5432) + `npm run dev`.
Weather forecasts: populated by `fetchWeatherData()` on startup + 15–30 min timer + manual /scrape-now.
