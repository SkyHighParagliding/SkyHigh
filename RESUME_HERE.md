# RESUME_HERE — Last updated: 2026-05-21 (session 10)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway

## Where I left off
Completed all sub-tasks of the closure calendar feature (TASK-036):

Session 10 fixes and additions:
1. **SQLite compat**: Fixed 22 instances of PostgreSQL `::text` cast syntax in `crud.ts`, `checkins.ts`, `bulkImport.ts` — these were silently broken in dev (`NODE_ENV=development`) mode
2. **Login fix**: Dev SQLite DB had stale bcrypt hashes; reset admin passwords directly via node script
3. **Wind map color**: Site dots now turn red when a scheduled closure includes today (not only `status='closed'`)
4. **Date pills**: `SiteDetail` now shows up to N individual red date pills for each upcoming closure date (today excluded), where N is configurable per-site (1–10, default 7) via `closurePillsMax` column (migration 021)
5. **Banner exclusion**: Permanently closed sites (`status='closed'`) are excluded from the home page banner
6. **Admin UI**: `closurePillsMax` number input (1–10) added in the Closure Dates section; disabled when permanently closed

All committed: `6cb94b1 [TASK-036] Fix SQLite compat issues, wind map closure color, add date pills feature`

## Last completed task
- TASK-036: Site Scheduled Closure Calendar — completed 2026-05-21 (all sub-tasks done)

## Currently in progress
- None

## Next task to start
- TASK-029: Harden DEFAULT_ADMINS for Production (document env var format, create one-time setup script)
- OR TASK-031: Pilot XC Flight History Export

## Open questions / blockers
- Browser UI not verified via harness (CDP permission not granted). Feature works at API level; user should verify visually at http://localhost:5173/sites/three-sisters-flowerdale and http://localhost:5173/admin/sites/three-sisters-flowerdale/edit
- Production deployment (Railway) still needs migration 021 to run — it will auto-apply on next deploy

## Quick context refresher
Dev environment is now correctly on `NODE_ENV=development` (port 3001, matches Vite proxy). The closure calendar feature is fully complete: admin calendar picker, per-site date pill count, automated home-page banners (excluded for permanently closed sites), wind map red dots for scheduled closure days, and individual date pills on the site detail page.
