# RESUME_HERE — Last updated: 2026-05-28 (Session 28 end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — fully deployed, all changes pushed

## Where I left off

Session 28 continued from the end of the exhaustive 5-pass DB audit (Session 27). The only new work this session was adding a compact linked contents index to the Admin Manual page (`src/pages/AdminManual.tsx`). The index groups 32 sections into 4 categories (Content Management, Dashboard Settings, Management, Reference) with inline dot-separated anchor links. Committed as 4bb6887 and pushed to Railway.

## Last completed task
- [FEATURE] Admin Manual compact index — commit 4bb6887

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
Session 27 hardened the codebase with 81 DB bugs fixed across 5 schema-first audit passes.
