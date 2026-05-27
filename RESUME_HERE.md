# RESUME_HERE — Last updated: 2026-05-27 (session 24/25 end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — weather cards now working

## Where I left off

Session 24/25 fixed the weather card "No weather data available" bug on production.
Latest commit is `08178fe` (deployed to Railway, confirmed fixed by user).

**All done this session:**
- Fixed Railway build failure (commit `520ad78`): 4 route files had stale `import db from "../db.js"` —
  committed the locally-correct PG-native versions of `search.ts`, `weather.ts`, `tidyhq.ts`, `competitions.ts`
- Fixed weather forecast pipeline (commit `c276c30`):
  - Root cause: `fetchWeatherData` called `fetchFineGrid()` without force — production `wind_grid_data`
    cache was empty/stale (from old SQLite-era deployment), so no forecasts could be extracted
  - Fix: when `isManual=true`, now calls `fetchFineGrid(true)` to force a fresh Open-Meteo fetch
  - Also: `fetchWeatherData` now returns `WeatherScrapeResult` with detailed diagnostics
  - `/api/weather/scrape-now` now returns diagnostics in response (visible in Network tab)
  - Confirmed: 74/74 sites got forecasts, 390 grid points, no errors
- Fixed bulk endpoint returning `{ error: true }` for all sites (commit `08178fe`):
  - Root cause: PostgreSQL folds unquoted SQL aliases to lowercase at the wire level
  - The query used `wf."siteId" as forecast_siteId` — pg returned key `forecast_siteid`
  - JS did `item.forecast_siteId === siteId` which always read `undefined`
  - Fix: double-quoted all camelCase aliases in the SELECT so PG preserves case

## What's next

1. Pick from the feature backlog — TASK-031 (XC Flight History Export) is the highest priority quick win
2. Smart Search bugs BUG-A through BUG-G remain open (7 bugs, Q40–Q50 test run not completed)

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
