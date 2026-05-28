# RESUME_HERE — Last updated: 2026-05-29

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — fully deployed, all changes pushed

## Where I left off

Session 32: Fixed the calendar closure badge not displaying on site guide pages (Flowerdale showing Open when it should show Closed). Root cause: `getClosureStatus`, inline date logic in `SiteDetail.tsx`, and `siteMarkerRenderer.ts` all used `toISOString().split('T')[0]` (UTC date). Melbourne is UTC+10, so before 10am Melbourne time UTC is still the previous calendar date — `isClosedToday` returned false even when today was a closure date. Fixed all three locations to use `toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })`, consistent with what the server already uses.

## Last completed tasks
- **fix(closure): Melbourne timezone for date comparison** — commit `a6d9b85`
  - `src/utils/closureStatus.ts` — added `toMelbourneDate()` helper, replaced 3 UTC calls
  - `src/pages/SiteDetail.tsx` — replaced inline UTC todayStr
- **fix(wind-map): Melbourne timezone for closure marker colour** — commit `ca27f0d`
  - `src/components/windmap/siteMarkerRenderer.ts` — same UTC bug, independent copy; also moved todayStr outside per-marker loop

## Currently in progress
- None

## Next task to start
- Continue Phase 5 tsc audit on another code area (94 pre-existing errors outside Sites system)
- Or feature backlog: TASK-031 (XC Flight History Export)

## Open questions / blockers
- None

## Quick context refresher

Two sessions of bug fixes this sprint. Session 31 fixed the wind map DPR canvas issue. Session 32 fixed a UTC timezone bug in closure badge logic that caused calendar-closed sites to appear Open before 10am Melbourne time. All three independent date-comparison locations in the frontend now use Melbourne timezone consistently with the server. Codebase is in good shape; 94 pre-existing tsc errors remain in areas outside the Sites system.
