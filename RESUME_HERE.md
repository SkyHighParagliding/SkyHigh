# Resume Here — SkyHigh Current State

**Session Date:** 2026-05-07  
**Branch:** main  
**Working Tree Status:** Clean — committed ✅ (not yet pushed)

## Latest Session Work (2026-05-07)

### TASK-033 — Configurable Grid Bounds with Visual Map Selector ✅

**Commit:** `d953a05`

**Two things in one task:**

1. **Renamed all grid identifiers** from location-specific to purpose-descriptive across the entire codebase:
   - `victoria` → `fine`, `wide` → `coarse`
   - DB storage keys: `victoria_grid_*` → `fine_grid_*`, `wide_grid_*` → `coarse_grid_*`
   - Settings keys: `victoriaGridLastRun` → `fineGridLastRun`, etc.
   - Old rows in `wind_grid_data` table will age out within 7 days; server treats DB as empty on first restart and triggers catch-up fetch

2. **Made grid bounds configurable via admin panel:**
   - `getGridBounds()` in `server/victoriaGrid.ts` reads 8 settings keys (`gridFineLatMin` etc.) with fallback to hardcoded defaults — no behavior change until admin saves new bounds
   - `getGridBounds()` exported and used by `extendedForecast.ts` too (removed duplicate local EXT_LAT/LON constants)
   - `POST /api/weather/grid-bounds` — validates containment (fine ⊂ coarse) + point count limits (fine ≤ 2000, coarse ≤ 3000), flushes in-memory caches on save
   - `GET /api/weather/grid-bounds` — returns current effective bounds
   - `src/components/GridBoundsSelector.tsx` — modal with Leaflet map, two draggable rectangles with corner handles, live point count + status (Good/OK/Too large), legend, Set button
   - "Configure Grid Areas" button added to Wind Grid Data card in `src/pages/AdminWeather.tsx`

**Files changed:**
- `server/victoriaGrid.ts` — full rename + `getGridBounds()`, `clearFineGridCaches()`, settings-driven bounds
- `server/extendedForecast.ts` — uses `getGridBounds()`, removed EXT_LAT/LON constants
- `server/utils/scheduledJobs.ts` — renamed keys + function names
- `server/routes/weather.ts` — renamed endpoints + new grid-bounds endpoints
- `server/weather.ts` — updated dynamic import to use `fetchFineGrid`
- `src/pages/AdminWeather.tsx` — renamed labels + Configure button
- `src/components/GridBoundsSelector.tsx` — new component

---

## Previous Session Work (2026-05-07 earlier)

### Wind Data Pipeline — Full Audit & Fix ✅
Two complete audit passes and fix cycles. All known issues resolved. See previous RESUME_HERE entries for detail.

---

## Current State
- **Site Status:** Fully operational ✅
- **Wind Pipeline:** Audited, fixed, and now configurable ✅
- **All Known Bugs:** Fixed ✅
- **Build:** Clean (no new TS errors) ✅
- **Pushed:** Not yet — push when ready

## Open Tasks
- Phase 4 Task 029: DEFAULT_ADMINS setup script (no urgency)
- Phase 5: Feature backlog (no timeline)
  - TASK-030: Siteguide version change email notification
  - TASK-031: Pilot XC flight history export
  - TASK-032: Multi-club white-label test

## Testing Notes for TASK-033
1. Open admin weather panel → Wind Grid Data card → "Configure Grid Areas" button
2. Map loads showing white (fine) and blue dashed (coarse) rectangles over Australia
3. Drag corner handles to reposition/resize each box
4. Status indicators (●Good/●OK/●Too large) update live with point count and fetch time
5. Fine box cannot be dragged outside coarse box
6. Set → saves 8 settings → use Fetch Now buttons to apply

For full context and project architecture, see `CLAUDE.md` (Section 0) and `wiki/`.
