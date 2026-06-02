# RESUME_HERE — Last updated: 2026-06-02

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — all changes pushed, deploying

## Where I left off

Session 33: Full wind map optimisation and hardening sprint.

Part 1 — Optimisation refactor (commit `e0fabf1`):
- Extracted shared `useWindPlayback` hook (~150 lines deduplicated from WindMapProto + SitesWindMap)
- Removed `transform` React state from WindCanvas (was causing 60fps re-renders during pan/zoom)
- Wind info computation moved into render loop, throttled to 10fps
- Added ResizeObserver replacing per-frame DOM clientWidth/clientHeight reads
- Added d3tile result caching keyed by transform+size; FIFO tile cache capped at 200
- Hoisted `todayStr` outside animation loop with 60s setInterval refresh
- Removed dead `hideWindInfo` prop
- Consolidated `SPEED_COLOR_STOPS` to single export from `windInterpolation.ts`
- Fixed closed-site pin rendering blue instead of red on single-site wind map

Part 2 — `/code-review high` on the above changes, then applied all 10 findings (commit `fe9bbcd`):
1. siteStatus/siteUpcomingClosureDates now in refs — marker colour live after mount
2. ResizeObserver rebuilds overlay canvas and particle pool on true dimension change
3. ResizeObserver guards canvas.width/height with equality check (no-op reset prevention)
4. loadTile adds img.onerror to evict failed/broken tile cache entries
5. todayFetcherRef pattern + JSDoc warning for stable useCallback requirement
6. toMelbourneDate exported from closureStatus.ts; WindCanvas uses it (single source)
7. pinColor() helper extracted in siteMarkerRenderer — one owner for colour decision
8. forecastStart/forecastEnd memoized; gridBoundsRef avoids string parsing per tick
9. 7-day fetch parses JSON error body for human-readable messages
10. tileKey uses .toFixed(1) consistently for x/y/k

## Last completed tasks
- Wind map optimisation + 10 code review fixes — commits `e0fabf1`, `fe9bbcd`
- Visually verified in Chrome: multi-site map loads, Arthur's Seat shows red pin in single-site modal

## Currently in progress
- None

## Next task to start
- Feature backlog: TASK-031 (XC Flight History Export — S effort)
- Or: TASK-030 (Siteguide Version Change Email Notification — M effort)
- Completed: Phase 5 tsc audit (0 errors remaining — resolved all 94 pre-existing errors)

## Open questions / blockers
- None

## Quick context refresher

Session 33 was a wind map code quality sprint — optimisation + a high-effort code review + applying all 10 findings. Wind map codebase is now substantially cleaner and more correct. The ResizeObserver, tile cache, and stale closure bugs were the highest-severity fixes. Codebase has 94 pre-existing tsc errors in unrelated files (Admin pages, XC maps, Layout) — none in wind map area.
