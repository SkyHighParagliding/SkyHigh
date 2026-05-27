# RESUME_HERE — Last updated: 2026-05-27 (session 23)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — SQLite fully removed, pure PG-native codebase

## Where I left off

Session 23 completed the full SQLite removal across the entire codebase. The project
is now 100% PostgreSQL-native with zero `better-sqlite3` / `db.prepare` references.

**All done this session (SQLite removal):**

- Converted all remaining routes: `procedures.ts`, `searchLogs.ts`, `pageviews.ts`, `populate-banners.ts`
- Converted all services/utils/middleware: `auth.ts`, `sessionTokens.ts`, `weather.ts`,
  `scheduledJobs.ts`, `victoriaGrid.ts`, `extendedForecast.ts`, `realMessageService.ts`,
  `demoRetrievalService.ts`, `realFlightService.ts`, `realRetrievalService.ts`,
  `siteguideVersionCheck.ts`, `googleDrive.ts`, `freeflightwx.ts`, `tides.ts`,
  and all simple utils (aiModels, fixStaleImages, tidyhqMemberFilter, siteguideZoneData, health)
- Deleted dead code: `databaseMaintenance.ts`, `queryOptimization.ts`, `edgeCases.ts`,
  `migrations.ts` runner, 28 TypeScript migration files, `migrate_storage.ts`, `api.test.ts`
- Deleted SQLite adapter layer: `sqliteDb.ts`, `pgDb.ts`
- Stripped `server/db.ts` — SQLite code removed, only PG migration runner remains
- Converted `server/seed.ts` — full `db.transaction` → `transaction(client => ...)` rewrite
- Converted `server.ts` — removed `import db`, converted `submissionLimiter.max` and `/manifest.json`
- Removed `better-sqlite3` from `package.json`
- All committed in phases; **NOT YET PUSHED to GitHub/Railway**

## What's next

1. **Verify production** — Railway is deploying now; check logs for migration errors
2. Pick from the feature backlog (see tasks/todo.md)

## Open questions / blockers
- Smart Search bugs (BUG-A through BUG-G) remain open — 7 bugs from the 50Q test run
- Q40–Q50 of the Smart Search test run not yet completed

## Quick context refresher

The codebase is now fully PG-native. `server/pg.ts` exports `query`, `queryOne`, `execute`,
`transaction` — these are the only DB primitives used everywhere. `server/db.ts` is a
side-effect-only module that runs PG migrations on startup. No SQLite dependency anywhere.
All camelCase column names are double-quoted in every SQL statement. The 9 phases of
SQLite removal are committed locally; a `git push` will deploy them to Railway.
