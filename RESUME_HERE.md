# RESUME_HERE — Last updated: 2026-05-21 (session 10, end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway

## Where I left off

Session 10 completed the site scheduled closure calendar feature (TASK-036) in full, including several post-merge fixes triggered by testing on production:

**All changes pushed and live:**
- `[TASK-036]` SQLite compat fixes (::text), wind map closure dot color, date pills feature (migration 021)
- `[FIX]` closurePillsMax stale closure in useSiteForm useCallback
- `[FIX]` AdminSites list badge uses getClosureStatus
- `[SESSION-SUMMARY]` RESUME_HERE commit
- `[FIX]` PostgreSQL column case bug — migration 021 now quoted; migration 022 renames existing lowercase column
- `[FIX]` WeatherCardApple + WeatherCardClassic Open/Closed badge uses getClosureStatus

**Known issue at session end:** Production was still showing errors due to migration 022 not yet having run (Railway may still be deploying). User confirmed all fixed at end of session.

## Last completed task
- TASK-036: Site Scheduled Closure Calendar — fully complete including production fixes (2026-05-21)

## Currently in progress
- None

## Next task to start
- TASK-029: Harden DEFAULT_ADMINS for Production (env var docs + one-time setup script) — small task
- OR TASK-031: Pilot XC Flight History Export (CSV/GPX) — high user value

## Open questions / blockers
- None known

## Quick context refresher
The closure calendar feature is fully shipped. Admins set closure dates via a calendar picker (replacing the old Status dropdown). Home page shows a 7-day-ahead banner per site. Site detail shows individual date pills. WeatherCards, AdminSites list, wind map dots, and 7-day outlook all reflect scheduled closures. Permanently closed sites skip banners and date pills.

Dev environment: `NODE_ENV=development` in `.env` → server on port 3001, Vite proxy works. Do NOT change back to production before coding sessions.
