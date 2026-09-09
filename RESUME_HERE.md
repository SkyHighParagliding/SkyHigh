# RESUME_HERE — Last updated: 2026-09-09 (session 50)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 50 — two-grid architecture upgrade (ecmwf_ifs high-res). Work 95% done, waiting for
Open-Meteo hourly rate limit to reset before final verification fetch.

**Completed this session:**
1. **Correct model name**: `ecmwf_ifs_hres` (400 error) → `ecmwf_ifs` (correct, ~0.07° native res)
   - Changed in `server/utils/openMeteo.ts` (shared by all grid fetches)
2. **Two-grid architecture**: Replaced coarse 2.0° grid with thermal grid (0.09°, CAPE+BLH only)
   - New: `fetchThermalGrid`, `getCachedThermalGrid`, `extractThermalGrid` in `victoriaGrid.ts`
   - Fine grid: still 0.15° spacing, same 12 fields including CAPE+BLH
   - Removed all coarse/wide grid code from routes, scheduled jobs, admin UI, settings context
3. **Thermal tile size fix**: `THERMAL_MAX_PER_TILE` 500 → 300 (prevents HTTP 414 URL-too-long)
4. **Completeness fallthrough bug fix**: When fetch gets <80% data and no cache exists, now
   throws proper error instead of silently saving partial data as "ok"
5. **Extended forecast null guard**: Fixed crash in `computeExtendedWindGrid` when grid points
   have undefined lat/lon (defensive guards added at lines 611 and 630)
6. **Removed lifted_index** from extended forecast fields (not available on ecmwf_ifs)

**Commits this session:**
- `36e6324` — feat: Stage 1 thermal map overlay on wind map (previous session)
- `1815fb7` — fix: two-grid architecture (ecmwf_ifs) + thermal grid bugs

NOT pushed to GitHub (Jon may want to revert these UI/grid changes).

## Last completed task
- Session 50: Two-grid architecture + thermal grid bug fixes (committed, not pushed)
- Session 49 (2026-09-05): Davis gust fix + scraper schedule UI

## Currently in progress
- **Verifying thermal grid fetch works cleanly** — Open-Meteo hourly quota exhausted from
  repeated test fetches during debugging. Rate limit resets at top of hour (8:00pm Melbourne).
  Corrupted thermal grid row deleted from DB. After reset, start server + trigger fresh fetch.

## Next task to start
1. **After rate limit reset**: Start server, trigger `/api/weather/thermal-grid/fetch-now`,
   verify overlay shows nj~68 lat rows covering -39.5 to -33.5
2. **Trigger fine grid fetch**: `/api/weather/fine-grid/fetch-now` to replace old IFS025 data
3. **"Report bad answer" button** for Smart Search chat (was next before this grid work)

## Open questions / blockers
- Jon to decide whether to push these grid changes to Railway (they're committed locally)
- **Home hero on mobile** — landscape image + portrait phone decision still pending (Options A/C)
- **MMYC coordinates** — registry uses -38.2758, 145.0055. Worth eyeballing on a map.

## Quick context refresher
SkyHigh's wind map uses two grids: fine grid (0.15°, 12 fields, 5am daily) for wind particles
and per-site forecasts; thermal grid (0.09°, CAPE+BLH only, 5:26am daily) for the thermal
overlay on the wind map. Both now use Open-Meteo's ecmwf_ifs model (~0.07° native, same as
Windy's data source). The coarse 2.0° grid is removed. Code is committed but NOT pushed —
Jon decides when to push to Railway. Verify fetches work once rate limit resets at 8pm.
