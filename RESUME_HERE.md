# Resume Here — SkyHigh Current State

**Session Date:** 2026-05-07  
**Branch:** main  
**Working Tree Status:** Clean — pushed to GitHub ✅

## Latest Session Work (2026-05-07)

### Wind Data Pipeline — Full Audit & Fix ✅

Two complete audit passes and fix cycles on the wind data pipeline. All known issues resolved.

**Commits this session:**
- `0cc4d72` — cache key mismatch fix (root cause of 30s load time after IP change)
- `8ec93c2` — 7-issue wind pipeline fix (see below)
- `d11763c` — admin status bugs + overlay result caching (see below)

**What was fixed (commit 8ec93c2):**
1. CRITICAL: `wind-overlay/full` now reads from cache first, live-fetches only if DB empty
2. In-memory cache (30-min) added to Victoria + Wide raw grids
3. `GRID_CACHE_EXPIRY` extended 18h → 26h (covers overnight gap before 5am fetch)
4. Dead `/:siteId/wind-grid` endpoint cache key fixed to date-suffix format
5. HTTP → HTTPS in that endpoint's fallback URL
6. `WIDE_*` constant naming collision in `extendedForecast.ts` fixed (renamed to `EXT_*`)
7. `Cache-Control` headers standardized to `max-age=1800` across all wind endpoints

**What was fixed (commit d11763c):**
1. `fetchVictoriaGridWithStatus` + `fetchWideGridWithStatus`: threshold 18h → 26h (admin showed wrong status)
2. `fetchExtendedForecastWithStatus`: was looking up extinct bare key `'extended_grid'`; always returned null; admin always showed "unavailable". Fixed to date-suffix + ORDER BY DESC fallback
3. `scheduleExtendedForecast` startup SQL: OR clause made it non-deterministic (returned oldest row, not most recent); triggered unnecessary startup fetches on every restart
4. Removed dead `OPEN_METEO_URL = "http://..."` from `weather.ts`
5. `extractFullWindGrid()` now caches processed overlay result (keyed by fetchedAt + Melbourne date), matching pattern used by `getExtendedWindGrid()`

**Architecture now (all three grids):**
- Memory cache → DB fallback (ORDER BY id DESC) → live fetch only if DB empty
- 7-day retention, cleanup runs on successful fetch only
- During 6-day outage: serves most recent DB entry, never triggers live fetch

---

## Previous Session Work (2026-05-07 earlier)

### Phase 3 Hardening — Audit & Fixes ✅
- Created `server/constants.ts` with 40+ centralized config constants
- Updated pagination.ts, sessionTokens.ts, csrf.ts to import from constants.ts
- Added X-Total-Count headers to 5 list endpoints
- All Phases 1, 2, 3 complete; Phase 4 at 3/4 (CSRF Redis deferred, DEFAULT_ADMINS partial)

---

## Current State
- **Site Status:** Fully operational ✅
- **Wind Pipeline:** Fully audited and fixed ✅
- **All Known Bugs:** Fixed ✅
- **Build:** Clean ✅
- **Pushed:** ✅

## Git Status
- **Branch:** main
- **Latest commits:**
  - `d11763c`: Admin status bugs + overlay result caching
  - `8ec93c2`: 7-issue wind pipeline fix
  - `0cc4d72`: Cache key mismatch fix

## Open Tasks
- Phase 4 Task 029: DEFAULT_ADMINS setup script (no urgency)
- Phase 5: Feature backlog (no timeline)

---

For full context and project architecture, see `CLAUDE.md` (Section 0) and `wiki/`.
