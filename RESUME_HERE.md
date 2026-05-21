# RESUME_HERE — Last updated: 2026-05-21 (session 9)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway

## Where I left off
Completed the site scheduled closure calendar feature (TASK-036). All 15 files created/modified. Migration v20 (`site_closure_dates`) confirmed running. All three new API endpoints verified via direct curl to port 5000. Documentation (wiki + CLAUDE.md) updated. Awaiting final git commit.

**Note on dev environment:** The `.env` file sets `NODE_ENV="production"`, which makes the server bind to port 5000 in dev. Vite proxy targets port 3001. This pre-existing mismatch causes browser API calls to return 500 in dev. Direct API testing (curl to :5000) works correctly. Browser UI verification was not possible in this session due to this env config issue.

## Last completed task
- TASK-036: Site Scheduled Closure Calendar — completed 2026-05-21

## Currently in progress
- Phase 4: Production Deployment (TASK-029 env var docs + setup script remaining)

## Next task to start
- TASK-029: Harden DEFAULT_ADMINS for Production (document env var format, create one-time setup script)
- OR TASK-031: Pilot XC Flight History Export

## Open questions / blockers
- Dev environment port mismatch: `.env` has `NODE_ENV="production"` → server uses port 5000, but Vite proxy targets 3001. Browser UI testing fails. Either change `.env` to `NODE_ENV="development"` or adjust proxy. Not a blocker for production.

## Quick context refresher
The closure calendar feature is complete: admins can select future closure dates via a custom calendar picker in the site edit page (replacing the old Status dropdown). A "Permanently Closed" checkbox also lives there. Home page auto-shows a blue banner 7 days before any scheduled closure. Site cards show upcoming closure pills. The 7-day weather outlook flags closure days with a red "Closed" label. Emergency `temporarilyClosed` (Safety Officers) is unchanged. All backed by new `site_closure_dates` table (migration 020).
